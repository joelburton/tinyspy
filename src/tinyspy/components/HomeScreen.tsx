import { useEffect, useState } from 'react'
import type { Session } from '@supabase/supabase-js'
import { supabase } from '../../common/lib/supabase'
import { Link } from '../../common/lib/Link'
import { db } from '../db'
import { db as commonDb } from '../../common/db'
import { HowToPlayModal } from './HowToPlayModal'

type ClubListEntry = {
  id: string
  handle: string
  name: string
}

type Props = {
  session: Session
  /** Called by the create/join handlers to enter the new game's
   *  route (`/g/<id>`); the URL is the source of truth from there. */
  onEnterGame: (gameId: string) => void
}

/**
 * Post-login screen for a user not currently in a game.
 *
 * Affordances today (transitional):
 *
 *   - Ad-hoc Tinyspy: "Create new game" / "Join with a code"
 *     (the lobby + join_code flow that commit 5 will retire)
 *   - Clubs (added in commit 4): "Your clubs" list + "Create a club"
 *     link. RLS auto-filters the list to clubs the caller is in;
 *     solo clubs (handle starts with '=') are filtered out of the
 *     list view since they're an internal anchor, not something
 *     users browse.
 *
 * Both affordances coexist in this commit so we can manually test
 * clubs without first nuking Tinyspy's existing flow. Commit 5
 * replaces this whole screen with a club-driven equivalent.
 *
 * Also fetches the user's `username` on mount for the "Welcome,
 * {name}" greeting. The profile row is guaranteed to exist by the
 * `handle_new_user` trigger in the baseline migration.
 */
export function HomeScreen({ session, onEnterGame }: Props) {
  const [username, setUsername] = useState<string | null>(null)
  const [clubs, setClubs] = useState<ClubListEntry[]>([])
  const [code, setCode] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [howToOpen, setHowToOpen] = useState(false)

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

  useEffect(() => {
    let mounted = true
    // RLS scopes this to clubs the caller is a member of. The
    // `not('handle','like','=%')` filter hides solo clubs from the
    // browse list — they exist as an anchor for solo games, not a
    // user-facing club. `not('handle','ilike',...)` would do the
    // same thing case-insensitively, but '=' is fixed lowercase
    // anyway since the trigger writes it literally.
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

  async function onCreate() {
    setError(null)
    setBusy(true)
    const { data, error } = await db.rpc('create_game').single()
    setBusy(false)
    if (error || !data) {
      setError(error?.message ?? 'failed to create game')
      return
    }
    onEnterGame(data.id)
  }

  async function onJoin(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    setBusy(true)
    const { data, error } = await db.rpc('join_game', { code })
    setBusy(false)
    if (error || !data) {
      setError(error?.message ?? 'failed to join game')
      return
    }
    onEnterGame(data)
  }

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

      <hr />

      <section>
        <h3>Quick game (no club)</h3>
        <p className="muted">
          The ad-hoc Tinyspy lobby. Going away once the clubs work
          (commit 5) lands.
        </p>
        <div className="actions">
          <button type="button" onClick={onCreate} disabled={busy}>
            Create new game
          </button>

          <div className="divider">or join with a code</div>

          <form onSubmit={onJoin}>
            <input
              type="text"
              placeholder="ABC123"
              value={code}
              onChange={(e) => setCode(e.target.value.toUpperCase())}
              maxLength={6}
              disabled={busy}
              autoCapitalize="characters"
              autoComplete="off"
            />
            <button type="submit" disabled={busy || code.length < 6}>
              Join
            </button>
          </form>
        </div>
        {error && <p className="error">{error}</p>}
      </section>

      <p className="muted home-footer">
        <button type="button" className="link-button" onClick={() => setHowToOpen(true)}>
          How to play
        </button>
        <span className="dot-separator">·</span>
        <button type="button" className="link-button" onClick={() => supabase.auth.signOut()}>
          Log out
        </button>
      </p>

      <HowToPlayModal open={howToOpen} onClose={() => setHowToOpen(false)} />
    </div>
  )
}
