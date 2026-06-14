import { useEffect, useState } from 'react'
import type { Session } from '@supabase/supabase-js'
import { db as commonDb } from '../db'
import { Link } from '../lib/Link'
import { navigate } from '../lib/router'
import { ClubChatPanel } from './ClubChatPanel'
import { games } from '../../games'
import type { Database } from '../../types/db'

type ClubRow = Database['common']['Tables']['clubs']['Row']
type Member = { user_id: string; username: string }

type Props = {
  session: Session
  handle: string
}

/**
 * Club detail page — accessed via `/c/<handle>`.
 *
 * Shows the club name, member roster, and chat. Games-in-this-club
 * (active / paused / completed lists) will appear here once
 * commit 5 wires up tinyspy.games.club_id; for now there's a
 * placeholder explaining the gap.
 *
 * RLS gates everything: a non-member's `clubs.select` returns zero
 * rows, so visiting `/c/some-other-club` shows a "not found" rather
 * than a forbidden-style error. Same protection covers
 * `club_members` (you only see your own clubs' rosters) and
 * `messages` (covered transitively by useClubChat).
 *
 * Data flow:
 *   1. Look up the club by handle (single, may return 0 rows → not found).
 *   2. Fetch member user_ids for that club.
 *   3. Fetch profiles for those user_ids (separate query rather than
 *      a PostgREST embed — within-schema FK so the embed would
 *      probably work, but two small focused queries are easier to
 *      reason about and match the pattern in useGame.ts).
 *   4. Render roster + chat.
 *
 * Note: realtime subscription to common.club_members exists (added
 * to the publication in the clubs migration), so future "membership
 * changed" events could be picked up, but v1 has no add/remove flow
 * so we skip the subscription to keep the hook simple.
 */
export function ClubPage({ session, handle }: Props) {
  const [club, setClub] = useState<ClubRow | null>(null)
  const [members, setMembers] = useState<Member[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [startError, setStartError] = useState<string | null>(null)
  const [starting, setStarting] = useState<string | null>(null)

  async function handleStart(gametype: string) {
    const game = games.find((g) => g.gametype === gametype)
    if (!club || !game) return
    setStartError(null)
    setStarting(gametype)
    const result = await game.startGameInClub(club.id)
    setStarting(null)
    if ('error' in result) {
      setStartError(result.error)
      return
    }
    navigate(`/g/${result.id}`)
  }

  useEffect(() => {
    let mounted = true

    async function load() {
      const { data: clubData, error: clubError } = await commonDb
        .from('clubs')
        .select('*')
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
        .from('club_members')
        .select('user_id')
        .eq('club_id', clubData.id)
      if (!mounted) return
      if (membersError) {
        setError(membersError.message)
        setLoading(false)
        return
      }
      const userIds = (membersData ?? []).map((m) => m.user_id)

      if (userIds.length === 0) {
        setMembers([])
        setLoading(false)
        return
      }

      const { data: profilesData } = await commonDb
        .from('profiles')
        .select('user_id, username')
        .in('user_id', userIds)
      if (!mounted) return
      setMembers((profilesData ?? []) as Member[])
      setLoading(false)
    }

    load()
    return () => {
      mounted = false
    }
  }, [handle])

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

      <section>
        <h3>Play a game</h3>
        {/* Iterate the games registry — one button per registered
            gametype, calling its manifest's startGameInClub. ClubPage
            stays game-agnostic; tinyspy's RPC call lives inside the
            tinyspy manifest. Add boggle later and a button appears
            here automatically. */}
        <div className="actions">
          {games.map((g) => (
            <button
              key={g.gametype}
              type="button"
              onClick={() => handleStart(g.gametype)}
              disabled={starting !== null}
              title={g.blurb}
            >
              {starting === g.gametype ? 'Starting…' : `Start ${g.name}`}
            </button>
          ))}
        </div>
        {startError && <p className="error">{startError}</p>}
      </section>

      <ClubChatPanel clubId={club.id} members={members} />

      <p>
        <Link to="/" className="link-button">
          ← Back home
        </Link>
      </p>
    </div>
  )
}
