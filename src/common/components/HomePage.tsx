import { useEffect, useState } from 'react'
import type { Session } from '@supabase/supabase-js'
import { supabase } from '../lib/supabase'
import { Link } from '../lib/Link'
import { navigate } from '../lib/router'
import { db as commonDb } from '../db'
import { SetupGameDialog } from './SetupGameDialog'
import { StartGameButtons } from './StartGameButtons'
import { games } from '../../games'
import {
  playerCountFits,
  type GameManifest,
} from '../lib/games'

type ClubListEntry = {
  id: string
  handle: string
  name: string
}

type Props = {
  session: Session
}

/**
 * The shell's `/` landing page.
 *
 * Pure shell content: who you are, what clubs you're in, a
 * path to create a new club, and a "Play solo" section with one
 * button per single-player gametype your solo club is set up
 * to play. Multi-player games happen inside clubs, not here.
 *
 * Clubs RLS does the filtering for us — the `.from('clubs').select`
 * below returns only the clubs the caller is a member of. The
 * `not('handle','like','=%')` filter hides solo clubs from the
 * clubs list (they exist for solo-game anchoring, not as a
 * navigation target).
 *
 * Solo-game gating mirrors ClubPage's "Start a new game" section:
 * a game appears as a solo-play button iff (a) the user's solo
 * club has an m2m row for that gametype in common.clubs_gametypes
 * AND (b) the gametype's `numberOfPlayers` range admits 1.
 * Single-source-of-truth gating; same shape as ClubPage so
 * adding a new gametype that supports solo play surfaces here
 * automatically.
 */
export function HomePage({ session }: Props) {
  const [username, setUsername] = useState<string | null>(null)
  const [clubs, setClubs] = useState<ClubListEntry[]>([])
  const [soloClubId, setSoloClubId] = useState<string | null>(null)
  const [soloAllowedGametypes, setSoloAllowedGametypes] =
    useState<Set<string>>(new Set())
  const [pendingSetup, setPendingSetup] = useState<GameManifest | null>(null)
  const [startError, setStartError] = useState<string | null>(null)
  const [starting, setStarting] = useState<string | null>(null)

  // Load the caller's username for the greeting. Dep is the user id
  // (not the full session object), so background token refreshes —
  // which return a new Session reference with the same user — don't
  // trigger a refetch.
  useEffect(() => {
    let mounted = true
    commonDb
      .from('profiles')
      .select('username')
      .eq('user_id', session.user.id)
      .single()
      .then(({ data, error }) => {
        if (!mounted) return
        if (error) {
          console.error('failed to load profile', error)
          return
        }
        setUsername(data.username)
      })
    return () => {
      mounted = false
    }
  }, [session.user.id])

  // Load the caller's clubs. Same dep choice as the username effect
  // above: keyed on user id (not the session reference) so token
  // refreshes don't cause spurious reloads.
  useEffect(() => {
    let mounted = true
    commonDb
      .from('clubs')
      .select('id, handle, name')
      .not('handle', 'like', '=%')
      .order('created_at', { ascending: false })
      .then(({ data, error }) => {
        if (!mounted) return
        if (error) {
          console.error('failed to load clubs', error)
          return
        }
        setClubs(data ?? [])
      })
    return () => {
      mounted = false
    }
  }, [session.user.id])

  // Resolve the caller's solo club + its allowed-gametype m2m.
  // The solo club is uniquely identified by RLS (the caller's only
  // membership in a `=`-prefixed-handle club) — slugify_club_name
  // strips `=` so no user-created club can collide with the
  // solo-club namespace. `.maybeSingle()` handles the theoretical
  // case where the trigger hasn't materialized one yet (shouldn't
  // happen, but bail to "no solo section" rather than crash).
  useEffect(() => {
    let mounted = true

    async function load() {
      const { data: clubData } = await commonDb
        .from('clubs')
        .select('id')
        .like('handle', '=%')
        .maybeSingle()
      if (!mounted) return
      if (!clubData) return
      setSoloClubId(clubData.id)

      const { data: kindsData } = await commonDb
        .from('clubs_gametypes')
        .select('gametype')
        .eq('club_id', clubData.id)
      if (!mounted) return
      setSoloAllowedGametypes(new Set((kindsData ?? []).map((k) => k.gametype)))
    }

    load()
    return () => {
      mounted = false
    }
  }, [session.user.id])

  async function handleStart(gametype: string) {
    const game = games.find((g) => g.gametype === gametype)
    if (!soloClubId || !game) return
    setStartError(null)
    // Same shape as ClubPage's handleStart — games with a setup
    // form go through the modal; games with setupForm: null fire
    // the RPC immediately. The dialog is keyed on the solo club's
    // id, so create_game lands the game there.
    if (game.setupForm) {
      setPendingSetup(game)
      return
    }
    setStarting(gametype)
    // Bypass-mode (setupForm null): solo, so playerUserIds is just
    // the caller. No game uses setupForm:null today; kept for the
    // future zero-setup case.
    const result = await game.startGameInClub(soloClubId, null, [session.user.id])
    setStarting(null)
    if ('error' in result) {
      setStartError(result.error)
      return
    }
    navigate(`/g/${game.gametype}/${result.id}`)
  }

  // The solo-membership list passed to the setup dialog. We could
  // skip the profile-fetch and synthesize from the session, but
  // using the same { user_id, username } shape ClubPage uses keeps
  // SetupGameDialog game-agnostic — no special "solo" branch.
  const soloMembers = username
    ? [{ user_id: session.user.id, username }]
    : []

  // The eligible solo gametypes — intersection of (the m2m for
  // the solo club) and (gametypes whose range admits 1 player).
  const soloGames = games
    .filter((g) => soloAllowedGametypes.has(g.gametype))
    .filter((g) => playerCountFits(g.numberOfPlayers, 1))

  return (
    <div className="card">
      <h1>Welcome{username ? `, ${username}` : ''}</h1>
      <p className="muted">{session.user.email}</p>

      <section>
        <h3>Your clubs</h3>
        {clubs.length === 0 ? (
          <p className="muted">You haven't joined a club yet.</p>
        ) : (
          <ul>
            {clubs.map((c) => (
              <li key={c.id}>
                <Link to={`/c/${c.handle}`}>{c.name}</Link>{' '}
                <span className="muted">/c/{c.handle}</span>
              </li>
            ))}
          </ul>
        )}
        <p>
          <Link to="/c/new" className="link-button">
            Create a new club
          </Link>
        </p>
      </section>

      {/* Solo-play section. Renders only when there's at least
          one eligible game — empty section reads as a bug. */}
      {soloGames.length > 0 && (
        <section>
          <h3>Play solo</h3>
          <p className="muted">
            Games that work on your own. Your solo space is hidden
            from the clubs list above but acts as a regular club
            under the hood (history, settings, chat).
          </p>
          <StartGameButtons
            games={soloGames}
            memberCount={1}
            getLabel={(g) => `Play ${g.name} solo`}
            starting={starting}
            onStart={handleStart}
          />
          {startError && <p className="error">{startError}</p>}
        </section>
      )}

      <p className="muted home-footer">
        <button
          type="button"
          className="link-button"
          onClick={() => supabase.auth.signOut()}
        >
          Log out
        </button>
      </p>

      {pendingSetup && soloClubId && (
        <SetupGameDialog
          manifest={pendingSetup}
          members={soloMembers}
          clubId={soloClubId}
          onStarted={(id) => {
            // Capture gametype before clearing pendingSetup — see
            // the matching ClubPage handler for the rationale.
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
