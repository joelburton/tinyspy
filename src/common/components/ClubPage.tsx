import { useCallback, useEffect, useState } from 'react'
import type { Session } from '@supabase/supabase-js'
import { db as commonDb } from '../db'
import { supabase } from '../lib/supabase'
import { Link } from '../lib/Link'
import { navigate } from '../lib/router'
import { channelDedupSuffix } from '../lib/channelDedup'
import { ChatBubble } from './ChatBubble'
import { FloatingChat } from './FloatingChat'
import { ClubGameCard } from './ClubGameCard'
import { Menu } from './Menu'
import { PupgamesLogo } from './PupgamesLogo'
import { SetupGameDialog } from './SetupGameDialog'
import { StartGameButtons } from './StartGameButtons'
import { StatusSlot } from './StatusSlot'
import { games } from '../../games'
import type {
  CommonGameListRow,
  FeedbackMsg,
  GameManifest,
  MenuSection,
} from '../lib/games'
import type { Database } from '../../types/db'
import styles from './ClubPage.module.css'

// Narrower than Database[...]['Row'] — see code-conventions.md's "Avoid
// SELECT *". Adding a new column to common.clubs requires
// explicitly listing it here AND in the select() below.
type ClubRow = Pick<
  Database['common']['Tables']['clubs']['Row'],
  'id' | 'handle' | 'name'
>
// The realtime payload's `.new` field for common.games. We only
// read the fields needed to drive auto-nav + current-view tracking;
// the Pick anchors the field set to the schema.
type GameRow = Pick<
  Database['common']['Tables']['games']['Row'],
  'id' | 'club_id' | 'gametype' | 'is_current_view'
>
import type { Member } from '../lib/games'

/**
 * Display shape for one game in the club's games list. Built from
 * a common.games row plus the dispatched `labelFor` output. The
 * card component reads this verbatim; ClubPage's classify-into-
 * sections logic also reads `isTerminal` to assign the right
 * state for CSS treatment.
 */
type ListedGame = {
  gameId: string
  gametype: string
  title: string
  startedAt: string
  isTerminal: boolean
  statusLabel: string
}

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
 * window) starts/ends a game, the current-view pointer changes
 * and we refetch — so the games section updates without a
 * manual refresh. Within-game updates (chat, board state, etc.)
 * belong to other subscriptions inside those views; ClubPage
 * only cares about the club's current-view pointer + the
 * games-list shape.
 */
export function ClubPage({ session, handle }: Props) {
  const [club, setClub] = useState<ClubRow | null>(null)
  const [members, setMembers] = useState<Member[]>([])
  const [allGames, setAllGames] = useState<ListedGame[]>([])
  const [activeGameId, setActiveGameId] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  // Shared error channel for club-page actions (delete-game today;
  // future surfaces land here too rather than competing for
  // screen space). Named for legacy reasons — once dominated by
  // the no-setup-form direct-start path that's now excised; today
  // it's a generic action error.
  const [startError, setStartError] = useState<string | null>(null)
  // The set of gametypes this club is allowed to play, read from
  // common.clubs_gametypes. v1 populates this with every registered
  // gametype at club-creation time; per-club opt-out is deferred.
  // We still gate FE rendering on this set so a future
  // gametype-not-auto-added-to-this-club state works correctly,
  // and so the shape is in place for the eventual club-settings UI.
  const [allowedGametypes, setAllowedGametypes] = useState<Set<string>>(new Set())
  // Saved setup defaults per gametype, also from clubs_gametypes.
  // NULL when the friends haven't started a game of that gametype
  // yet — the dialog falls through to the manifest's static
  // defaults in that case. Sourced from the same query that
  // populates allowedGametypes; passed to SetupGameDialog as
  // `savedDefault` so the form pre-fills with what the friends
  // played last time. See common.create_game's saved_default arg
  // for the write side and docs/code-conventions.md (TBD) for
  // the evolution-strategy story.
  const [savedDefaults, setSavedDefaults] = useState<
    Map<string, unknown>
  >(new Map())
  // The manifest currently being set up in the dialog, or null if
  // the dialog isn't open. Setting this opens the dialog (the
  // dialog component is mounted iff this is non-null); the dialog
  // calls back into us via onStarted / onCancel to close.
  const [pendingSetup, setPendingSetup] = useState<GameManifest | null>(null)
  // The currently-active feedback pill shown in the header's
  // <StatusSlot>, or null when the slot should show the default
  // <PlayersStrip>. Local-only — ClubPage doesn't expose a
  // ctx.feedback API the way GamePage does, because there's no
  // render-prop child here. Concrete uses today: the
  // "<title> deleted" toast in handleDelete, and the "coming soon"
  // toasts on the placeholder menu items.
  const [feedback, setFeedback] = useState<FeedbackMsg | null>(null)

  // Auto-clear `timed`-dismiss feedback after the configured
  // duration. Mirrors GamePage's autoClearTimedFeedback — same
  // shape; the duplication is borderline (5 lines twice), worth
  // extracting into a hook if a third consumer arrives.
  useEffect(function autoClearTimedFeedback() {
    if (!feedback) return
    if (feedback.dismiss.kind !== 'timed') return
    const ms = feedback.dismiss.ms ?? 2200
    const t = setTimeout(() => setFeedback(null), ms)
    return () => clearTimeout(t)
  }, [feedback])

  // Stable identity for the StatusSlot's onCloseFeedback prop
  // so passing it into props doesn't restage downstream effects.
  const clearFeedback = useCallback(() => setFeedback(null), [])

  /**
   * Delete a game from this club. Same RPC for current vs
   * non-current games; the FE-side difference is that the
   * current-view game has peers on the GamePage who need to be
   * moved out BEFORE the row vanishes. We broadcast a `suspend`
   * event on the game's channel — exactly what the suspend-
   * confirm modal does — and useCommonGame's handler navigates
   * each peer back to the club page. Once they've cleared, the
   * DELETE cascades and the postgres-changes subscription on
   * ClubPage refetches the games list.
   *
   * For non-current games no peers are viewing them by
   * definition (is_current_view=false ⟹ nobody on the GamePage),
   * so we skip the broadcast and call the RPC directly.
   *
   * The card itself owns the confirm-flow state (idle → confirming
   * → deleting) and the auto-revert timeout; this function is
   * called only when the user has already confirmed. We surface
   * errors through `startError` since it's the existing
   * club-page error channel and a separate `deleteError` slot
   * would compete for the same screen real estate.
   */
  async function handleDelete(gameId: string, isCurrent: boolean) {
    if (!club) return
    setStartError(null)

    if (isCurrent) {
      // Open a temp channel matching the game's stable name and
      // broadcast the suspend event so any peer on the GamePage
      // navigates back to the club page. The handler in
      // useCommonGame is already wired for this. We close the
      // channel as soon as the send completes — we're not
      // listening for anything on it.
      const ch = supabase.channel(`game:${gameId}`)
      await new Promise<void>((resolve) => {
        ch.subscribe((status) => {
          if (status === 'SUBSCRIBED') resolve()
        })
      })
      await ch.send({
        type: 'broadcast',
        event: 'suspend',
        payload: { type: 'suspend' },
      })
      supabase.removeChannel(ch)
      // Brief beat so peers have time to receive + navigate
      // before the row disappears. They handle a missing game
      // gracefully (load returns null → "Game not found"), so
      // this is friendliness, not correctness.
      await new Promise((r) => setTimeout(r, 150))
    }

    const { error } = await commonDb.rpc('delete_game', { target_game: gameId })
    if (error) {
      setStartError(`Couldn't delete game: ${error.message}`)
      throw error  // bubble to the card so it returns from 'deleting' to 'idle'
    }
    // Surface a transient toast in the header's status slot so
    // the user sees an explicit "yes, that worked" beat. Look up
    // the title BEFORE the postgres-changes refetch sweeps the
    // row out of allGames; the value is captured by the closure
    // and survives the rerender.
    const deleted = allGames.find((g) => g.gameId === gameId)
    setFeedback({
      tone: 'neutral',
      text: `${deleted?.title ?? 'Game'} deleted`,
      dismiss: { kind: 'timed' },
    })
    // No explicit list refresh — the postgres-changes
    // subscription below fires DELETE on common.games and our
    // loadGames() re-runs.
  }

  /**
   * Click handler for the per-gametype "Start X" buttons. Opens
   * the setup dialog — does NOT actually create the game; that
   * happens when the user clicks Start inside the dialog and
   * SetupGameDialog calls `manifest.startGameInClub`.
   *
   * Two distinct phases that both got called "start" before the
   * rename: this is `startSetup` (the first one); the dialog's
   * is `startGame`.
   */
  function handleStartSetup(gametype: string) {
    const game = games.find((g) => g.gametype === gametype)
    if (!club || !game) return
    setPendingSetup(game)
  }

  // Step 1: look up the club + roster. These don't change during
  // v1 (membership is fixed at creation), so we only fetch once.
  useEffect(function loadClubAndRoster() {
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
          .select('user_id, username, color')
          .in('user_id', userIds)
        if (!mounted) return
        setMembers((profilesData ?? []) as Member[])
      } else {
        setMembers([])
      }

      // Fetch the m2m rows for this club — drives which Start
      // buttons render AND seeds the SetupGameDialog with the
      // friends' last-played setup per gametype. The intersection
      // with the FE registry (computed at render time) naturally
      // hides gametypes the DB knows about but this FE bundle
      // doesn't.
      const { data: kindsData } = await commonDb
        .from('clubs_gametypes')
        .select('gametype, default_setup')
        .eq('club_id', clubData.id)
      if (!mounted) return
      const rows = kindsData ?? []
      setAllowedGametypes(new Set(rows.map((k) => k.gametype)))
      setSavedDefaults(
        new Map(
          rows
            .filter((k) => k.default_setup !== null)
            .map((k) => [k.gametype, k.default_setup as unknown]),
        ),
      )

      setLoading(false)
    }

    load()
    return () => {
      mounted = false
    }
  }, [handle])

  // Step 2: load games for this club + the current-view game id.
  // Re-runs whenever realtime tells us a games row for this club
  // changed (new game inserted, end_game wrote a terminal
  // play_state, set_current_view / unset_current_view flipped the
  // is_current_view pointer, etc.). Also fires on initial mount.
  useEffect(function subscribeToClubGames() {
    if (!club) return
    const clubId = club.id
    let mounted = true

    async function loadGames() {
      // One read into common.games — the labelFor refactor moved
      // all the listing data here, so per-gametype fan-out is
      // gone. Each row's label comes from the matching manifest's
      // pure `labelFor`. Games whose gametype isn't in this FE's
      // registry are silently skipped (the same forward-compat
      // posture used for Start buttons).
      const { data } = await commonDb
        .from('games')
        .select(
          'id, gametype, title, play_state, is_terminal, status, started_at, is_current_view',
        )
        .eq('club_id', clubId)
        .order('started_at', { ascending: false })
      if (!mounted) return

      const rows = data ?? []
      let currentId: string | null = null
      const listed: ListedGame[] = []
      for (const r of rows) {
        if (r.is_current_view) currentId = r.id
        const manifest = games.find((g) => g.gametype === r.gametype)
        if (!manifest) continue
        const listRow: CommonGameListRow = {
          id: r.id,
          gametype: r.gametype,
          play_state: r.play_state,
          is_terminal: r.is_terminal,
          status: r.status as Record<string, unknown> | null,
        }
        listed.push({
          gameId: r.id,
          gametype: r.gametype,
          title: r.title,
          startedAt: r.started_at,
          isTerminal: r.is_terminal,
          statusLabel: manifest.labelFor(listRow),
        })
      }
      setActiveGameId(currentId)
      setAllGames(listed)
    }

    loadGames()

    // Subscribe to common.games changes for this club. New-game
    // start (INSERT with is_current_view=true), set_current_view
    // (UPDATE on a different row), and unset_current_view /
    // create_game's auto-vacate (UPDATE flipping is_current_view
    // to false) all surface here. end_game does NOT touch
    // is_current_view — a terminal game stays current-view until
    // the last viewer leaves (review-the-final-state is a
    // legitimate use of the current slot).
    //
    // On INSERT or UPDATE whose new row has is_current_view=true —
    // the club picked a new current game — auto-navigate every
    // member into it. This is a club-level invariant: when a
    // club is playing, the whole club is in the same game; no
    // "I'll catch up later." (Solo clubs trivially satisfy this —
    // single member.) is_current_view=false UPDATEs do NOT
    // navigate anyone — players already in the game stay on the
    // game-over screen; players on the club page just see the
    // game move out of the Current section in the list.
    //
    // The "already there" guard prevents the player who started
    // the game (and was already navigated by SetupGameDialog's
    // onStarted) from getting a duplicate history entry when the
    // realtime echo of their own INSERT arrives.
    const channel = supabase
      .channel(`club-games:${clubId}:${channelDedupSuffix()}`)
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
            if (!row.is_current_view) return
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

  // Classify games. The current game is the one whose id matches
  // the is_current_view=true row from common.games — that one
  // gets its own prominent section. Everything else collapses
  // into a single "other games" list, with terminal vs non-
  // terminal distinguished by CSS (per docs/states.md → "no
  // special 'suspended' category in the schema or the listing").
  const activeGame = activeGameId
    ? allGames.find((g) => g.gameId === activeGameId) ?? null
    : null
  const otherGames = allGames.filter((g) => g.gameId !== activeGameId)

  // Menu sections for the club logo's dropdown. Mirrors the
  // GamePage menu shape (a single common section, no per-game
  // dynamic section because there's no PlayArea here to push
  // items in). Two of the three items are placeholders today —
  // they fire a "coming soon" toast so a click still has visible
  // feedback. See docs/ui.md → "ClubPage header" for the spec.
  const menuSections: MenuSection[] = [
    {
      items: [
        {
          id: 'home',
          label: 'Back to home',
          onClick: () => navigate('/'),
        },
        {
          id: 'rename',
          label: 'Rename club',
          onClick: () => setFeedback({
            tone: 'info',
            text: 'Rename club: coming soon',
            dismiss: { kind: 'timed' },
          }),
        },
        {
          id: 'delete',
          label: 'Delete club',
          onClick: () => setFeedback({
            tone: 'info',
            text: 'Delete club: coming soon',
            dismiss: { kind: 'timed' },
          }),
        },
      ],
    },
  ]

  return (
    <div className={styles.frame}>
      <header className={styles.header}>
        <Menu
          trigger={<PupgamesLogo />}
          sections={menuSections}
          triggerLabel="Club menu"
        />
        <ChatBubble />
        {/* StatusSlot's `players` prop is a Member[] under the
            hood; here we feed it the club's member roster (the
            naming.md rule keeps the variable named `members` in
            club context even though the component prop reads
            `players`). PlayersStrip renders the same colored-dot
            + colored-name shape either way. */}
        <StatusSlot
          players={members}
          feedback={feedback}
          onCloseFeedback={clearFeedback}
        />
      </header>

      {/* Two-column body that takes the rest of the viewport height
          (per docs/ui.md → "Page-height fits the viewport"). Left
          column holds the active game card + start-game buttons;
          right column is the "Other games" list as a fixed-size
          frame with internal overflow-y: auto. */}
      <main className={styles.body}>
        <section className={styles.left}>
          <header className={styles.titleBlock}>
            <h1 className={styles.title}>{club.name}</h1>
          </header>

          {activeGame && (
            <div>
              <h3>Active game</h3>
              <ClubGameCard
                gameId={activeGame.gameId}
                gametype={activeGame.gametype}
                title={activeGame.title}
                statusLabel={activeGame.statusLabel}
                startedAt={activeGame.startedAt}
                state="active"
                onDelete={() => handleDelete(activeGame.gameId, true)}
              />
            </div>
          )}

          <div>
            <h3>Start a new game</h3>
            {/* Filter the registry by the club's allowed-gametype m2m
                (one button per gametype this club may play) and let
                StartGameButtons handle the rendering, in-flight state,
                and disabled-for-doesn't-fit tooltip. ClubPage stays
                game-agnostic; the RPC call lives inside the manifest.
                Add boggle later and (assuming the m2m is populated for
                this club) a button appears here automatically. */}
            <StartGameButtons
              games={games.filter((g) => allowedGametypes.has(g.gametype))}
              memberCount={members.length}
              onStartSetup={handleStartSetup}
            />
            {activeGame && (
              <p className="muted">
                Starting a new game will suspend the currently active
                one (you can resume it later from this page).
              </p>
            )}
            {startError && <p className="error">{startError}</p>}
          </div>
        </section>

        <section className={styles.right}>
          <h3>Other games ({otherGames.length})</h3>
          {/* Fixed-size frame with internal scroll. The frame has
              flex: 1 inside the column, which has its own flex: 1
              inside the body, which is bounded by the .frame's
              calc(100vh - body padding) height. Each step of the
              flex chain needs min-height: 0 so overflow-y: auto
              actually kicks in. */}
          <div className={styles.gamesList}>
            {otherGames.length === 0 ? (
              <p className="muted">No other games yet.</p>
            ) : (
              otherGames.map((g) => (
                <ClubGameCard
                  key={g.gameId}
                  gameId={g.gameId}
                  gametype={g.gametype}
                  title={g.title}
                  statusLabel={g.statusLabel}
                  startedAt={g.startedAt}
                  state={g.isTerminal ? 'completed' : 'suspended'}
                  onDelete={() => handleDelete(g.gameId, false)}
                />
              ))
            )}
          </div>
        </section>
      </main>

      {/* hideClosedButton: the chat-bubble toggle lives in the
          header (<ChatBubble> above); FloatingChat only renders
          the panel itself, not a duplicate bottom-right button. */}
      <FloatingChat clubId={club.id} members={members} hideClosedButton />

      {pendingSetup && (
        <SetupGameDialog
          manifest={pendingSetup}
          members={members}
          clubId={club.id}
          savedDefault={savedDefaults.get(pendingSetup.gametype)}
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
