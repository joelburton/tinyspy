import { useEffect, useState } from 'react'
import type { Session } from '@supabase/supabase-js'
import { db as commonDb } from '../db'
import { supabase } from '../lib/supabase'
import { Link } from '../lib/Link'
import { navigate } from '../lib/router'
import { ClubChatPanel } from './ClubChatPanel'
import { SetupGameDialog } from './SetupGameDialog'
import { games } from '../../games'
import type { ClubGameEntry, GameManifest } from '../lib/games'
import { playerCountFits, playerCountLabel } from '../lib/games'
import type { Database } from '../../types/db'

// Narrower than Database[...]['Row'] — see code-conventions.md's "Avoid
// SELECT *". Adding a new column to common.clubs requires
// explicitly listing it here AND in the select() below.
type ClubRow = Pick<
  Database['common']['Tables']['clubs']['Row'],
  'id' | 'handle' | 'name'
>
// The realtime payload's `.new` field for common.games. We only
// read the fields needed to drive auto-nav + active-game tracking;
// the Pick anchors the field set to the schema.
type GameRow = Pick<
  Database['common']['Tables']['games']['Row'],
  'id' | 'club_id' | 'gametype' | 'is_active'
>
type Member = { user_id: string; username: string }

type Props = {
  session: Session
  handle: string
}

/**
 * Club detail page — accessed via `/c/<handle>`.
 *
 * Shows: club name, member roster, games (active / suspended /
 * completed), per-gametype "Start" buttons, and chat.
 *
 * RLS gates everything: a non-member's `clubs.select` returns zero
 * rows, so visiting `/c/some-other-club` shows a "not found" rather
 * than a forbidden-style error. Same protection covers
 * `clubs_members`, `common.games` (gates on is_club_member(club_id)),
 * each game's tables (via the gametype's own RLS), and `messages`
 * (covered transitively by useClubChat).
 *
 * Realtime: subscribed to common.games changes for this club. When
 * another tab (different member, or yourself in another
 * window) starts/ends a game, the active pointer changes and we
 * refetch — so the games section updates without a manual refresh.
 * Within-game updates (chat, board state, etc.) belong to other
 * subscriptions inside those views; ClubPage only cares about the
 * club's active-game pointer + the games-list shape.
 */
export function ClubPage({ session, handle }: Props) {
  const [club, setClub] = useState<ClubRow | null>(null)
  const [members, setMembers] = useState<Member[]>([])
  const [allGames, setAllGames] = useState<ClubGameEntry[]>([])
  const [activeGameId, setActiveGameId] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [startError, setStartError] = useState<string | null>(null)
  const [starting, setStarting] = useState<string | null>(null)
  // The set of gametypes this club is allowed to play, read from
  // common.clubs_gametypes. v1 populates this with every registered
  // gametype at club-creation time; per-club opt-out is deferred.
  // We still gate FE rendering on this set so a future
  // gametype-not-auto-added-to-this-club state works correctly,
  // and so the shape is in place for the eventual club-settings UI.
  const [allowedGametypes, setAllowedGametypes] = useState<Set<string>>(new Set())
  // The manifest currently being set up in the dialog, or null if
  // the dialog isn't open. Setting this opens the dialog (the
  // dialog component is mounted iff this is non-null); the dialog
  // calls back into us via onStarted / onCancel to close.
  const [pendingSetup, setPendingSetup] = useState<GameManifest | null>(null)

  async function handleStart(gametype: string) {
    const game = games.find((g) => g.gametype === gametype)
    if (!club || !game) return
    setStartError(null)
    // Games that declare a setup form route through the modal —
    // it collects the setup, calls startGameInClub itself, and
    // either fires onStarted (we navigate) or onCancel (we close).
    // Games with `setupForm: null` skip the modal and call
    // create_game immediately, the same shape ClubPage has always
    // had.
    if (game.setupForm) {
      setPendingSetup(game)
      return
    }
    setStarting(gametype)
    // Bypass-mode (setupForm null): all current club members play.
    // No game uses setupForm:null today; kept for the future
    // zero-setup case.
    const result = await game.startGameInClub(
      club.id,
      null,
      members.map((m) => m.user_id),
    )
    setStarting(null)
    if ('error' in result) {
      setStartError(result.error)
      return
    }
    navigate(`/g/${game.gametype}/${result.id}`)
  }

  // Step 1: look up the club + roster. These don't change during
  // v1 (membership is fixed at creation), so we only fetch once.
  useEffect(() => {
    let mounted = true

    async function load() {
      const { data: clubData, error: clubError } = await commonDb
        .from('clubs')
        .select('id, handle, name')
        .eq('handle', handle)
        .maybeSingle()
      if (!mounted) return
      if (clubError) {
        setError(clubError.message)
        setLoading(false)
        return
      }
      if (!clubData) {
        setError('Club not found, or you are not a member.')
        setLoading(false)
        return
      }
      setClub(clubData)

      const { data: membersData, error: membersError } = await commonDb
        .from('clubs_members')
        .select('user_id')
        .eq('club_id', clubData.id)
      if (!mounted) return
      if (membersError) {
        setError(membersError.message)
        setLoading(false)
        return
      }
      const userIds = (membersData ?? []).map((m) => m.user_id)

      if (userIds.length > 0) {
        const { data: profilesData } = await commonDb
          .from('profiles')
          .select('user_id, username')
          .in('user_id', userIds)
        if (!mounted) return
        setMembers((profilesData ?? []) as Member[])
      } else {
        setMembers([])
      }

      // Fetch the m2m rows for this club — drives which Start
      // buttons render. The intersection with the FE registry
      // (computed at render time) naturally hides gametypes the
      // DB knows about but this FE bundle doesn't.
      const { data: kindsData } = await commonDb
        .from('clubs_gametypes')
        .select('gametype')
        .eq('club_id', clubData.id)
      if (!mounted) return
      setAllowedGametypes(new Set((kindsData ?? []).map((k) => k.gametype)))

      setLoading(false)
    }

    load()
    return () => {
      mounted = false
    }
  }, [handle])

  // Step 2: load games for this club + the active-game id. Re-runs
  // whenever realtime tells us a games row for this club changed
  // (new game inserted, end_game flipped is_active to false, etc.).
  // Also fires on initial mount.
  useEffect(() => {
    if (!club) return
    const clubId = club.id
    let mounted = true

    async function loadGames() {
      // Active game derives from common.games where is_active=true.
      // The partial unique index guarantees at most one such row.
      const activeRes = await commonDb
        .from('games')
        .select('id')
        .eq('club_id', clubId)
        .eq('is_active', true)
        .maybeSingle()
      const results = await Promise.all(
        games.map((g) => g.fetchClubGames(clubId)),
      )
      if (!mounted) return
      setActiveGameId(activeRes.data?.id ?? null)
      setAllGames(results.flat())
    }

    loadGames()

    // Subscribe to common.games changes for this club. New-game
    // start (INSERT with is_active=true), end_game (UPDATE flipping
    // is_active to false), and create_game's auto-suspend of the
    // prior active game (UPDATE flipping is_active to false) all
    // surface here.
    //
    // On INSERT or UPDATE whose new row has is_active=true — the
    // club picked a new active game — auto-navigate every member
    // into it. This is a club-level invariant: when a club is
    // playing, the whole club is in the same game; no "I'll catch
    // up later." (Solo clubs trivially satisfy this — single
    // member.) is_active=false UPDATEs do NOT navigate anyone —
    // players already in the game stay on the game-over screen;
    // players on the club page just see the game move from Active
    // to Completed in the list.
    //
    // The "already there" guard prevents the player who clicked
    // Start (and was already navigated by `handleStart`) from
    // getting a duplicate history entry when the realtime echo of
    // their own INSERT arrives.
    const channel = supabase
      .channel(`club-games:${clubId}:${crypto.randomUUID()}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'common',
          table: 'games',
          filter: `club_id=eq.${clubId}`,
        },
        (payload) => {
          loadGames()
          if (payload.eventType === 'INSERT' || payload.eventType === 'UPDATE') {
            const row = payload.new as GameRow
            if (!row.is_active) return
            const target = `/g/${row.gametype}/${row.id}`
            if (window.location.pathname !== target) {
              navigate(target)
            }
          }
        },
      )
      .subscribe((status) => {
        if (status === 'SUBSCRIBED') loadGames()
      })

    return () => {
      mounted = false
      supabase.removeChannel(channel)
    }
  }, [club])

  if (loading) return <div className="card">Loading club…</div>
  if (error || !club) {
    return (
      <div className="card">
        <h1>Couldn't load club</h1>
        <p className="error">{error ?? 'Unknown error.'}</p>
        <p>
          <Link to="/" className="link-button">
            ← Back home
          </Link>
        </p>
      </div>
    )
  }

  const isSoloClub = club.handle.startsWith('=')

  // Classify games — active is the one whose id matches the
  // is_active=true row from common.games, completed are terminal,
  // suspended is everything else.
  const activeGame = activeGameId
    ? allGames.find((g) => g.gameId === activeGameId) ?? null
    : null
  const suspendedGames = allGames.filter(
    (g) => !g.isTerminal && g.gameId !== activeGameId,
  )
  const completedGames = allGames.filter((g) => g.isTerminal)

  function gameName(gameType: string) {
    return games.find((g) => g.gametype === gameType)?.name ?? gameType
  }

  return (
    <div className="card">
      <header>
        <h1>{club.name}</h1>
        {isSoloClub ? (
          <p className="muted">
            Your personal solo space. Hidden from your clubs list.
          </p>
        ) : (
          <p className="muted">
            <code>/c/{club.handle}</code>
          </p>
        )}
      </header>

      <section>
        <h3>Members ({members.length})</h3>
        <ul>
          {members.map((m) => (
            <li key={m.user_id}>
              {m.username}
              {m.user_id === session.user.id && (
                <span className="muted"> (you)</span>
              )}
            </li>
          ))}
        </ul>
      </section>

      {activeGame && (
        <section>
          <h3>Active game</h3>
          <p>
            <Link to={`/g/${activeGame.gameType}/${activeGame.gameId}`} className="link-button">
              Resume {gameName(activeGame.gameType)}
            </Link>{' '}
            <span className="muted">— {activeGame.statusLabel}</span>
          </p>
        </section>
      )}

      {suspendedGames.length > 0 && (
        <section>
          <h3>Suspended games</h3>
          <ul>
            {suspendedGames.map((g) => (
              <li key={g.gameId}>
                <Link to={`/g/${g.gameType}/${g.gameId}`}>
                  {gameName(g.gameType)} — {g.statusLabel}
                </Link>{' '}
                <span className="muted">
                  · started {new Date(g.startedAt).toLocaleString()}
                </span>
              </li>
            ))}
          </ul>
        </section>
      )}

      <section>
        <h3>Start a new game</h3>
        {/* Iterate the games registry filtered by the club's
            allowed-gametype m2m — one button per gametype this
            club may play. ClubPage stays game-agnostic; the RPC
            call lives inside the manifest. Add boggle later and
            (assuming the m2m is populated for this club) a
            button appears here automatically.

            Each button additionally checks the manifest's
            numberOfPlayers range against the club's member count.
            If the club is out of range, the button renders
            disabled with a tooltip — "Tinyspy needs exactly 2
            members" — so the user can see why the game's offered
            but unavailable rather than wondering where it went. */}
        <div className="actions">
          {games
            .filter((g) => allowedGametypes.has(g.gametype))
            .map((g) => {
              const fits = playerCountFits(g.numberOfPlayers, members.length)
              const title = fits ? g.blurb : playerCountLabel(g.numberOfPlayers)
              return (
                <button
                  key={g.gametype}
                  type="button"
                  onClick={() => handleStart(g.gametype)}
                  disabled={starting !== null || !fits}
                  title={title}
                >
                  {starting === g.gametype ? 'Starting…' : `Start ${g.name}`}
                </button>
              )
            })}
        </div>
        {activeGame && (
          <p className="muted">
            Starting a new game will suspend the currently active one (you
            can resume it later from this page).
          </p>
        )}
        {startError && <p className="error">{startError}</p>}
      </section>

      {completedGames.length > 0 && (
        <section>
          <h3>Completed games ({completedGames.length})</h3>
          <ul>
            {completedGames.slice(0, 20).map((g) => (
              <li key={g.gameId}>
                {gameName(g.gameType)} — {g.statusLabel}{' '}
                <span className="muted">
                  · {new Date(g.startedAt).toLocaleString()}
                </span>
              </li>
            ))}
          </ul>
          {completedGames.length > 20 && (
            <p className="muted">
              + {completedGames.length - 20} older games not shown.
            </p>
          )}
        </section>
      )}

      <ClubChatPanel clubId={club.id} members={members} />

      <p>
        <Link to="/" className="link-button">
          ← Back home
        </Link>
      </p>

      {pendingSetup && (
        <SetupGameDialog
          manifest={pendingSetup}
          members={members}
          clubId={club.id}
          onStarted={(id) => {
            // Capture gametype before clearing pendingSetup —
            // the state setter is asynchronous but our reference
            // to pendingSetup inside this closure is the one
            // from this render, so reading .gametype here is
            // safe regardless of ordering.
            const gametype = pendingSetup.gametype
            setPendingSetup(null)
            navigate(`/g/${gametype}/${id}`)
          }}
          onCancel={() => setPendingSetup(null)}
        />
      )}
    </div>
  )
}
