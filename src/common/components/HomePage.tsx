import { useEffect, useState } from 'react'
import type { Session } from '@supabase/supabase-js'
import { supabase } from '../lib/supabase'
import { Link } from '../lib/Link'
import { db as commonDb } from '../db'

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
 * Pure shell content: who you are, what clubs you're in, and a
 * path to create a new club. All games live inside clubs, so
 * starting a game happens on the club page, not here.
 *
 * Clubs RLS does the filtering for us — the `.from('clubs').select`
 * below returns only the clubs the caller is a member of. The
 * `not('handle','like','=%')` filter hides solo clubs (they exist
 * for solo-game anchoring, not as a UI surface).
 */
export function HomePage({ session }: Props) {
  const [username, setUsername] = useState<string | null>(null)
  const [clubs, setClubs] = useState<ClubListEntry[]>([])

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

      <p className="muted home-footer">
        <button
          type="button"
          className="link-button"
          onClick={() => supabase.auth.signOut()}
        >
          Log out
        </button>
      </p>
    </div>
  )
}
