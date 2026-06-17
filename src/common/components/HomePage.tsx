import { useEffect, useState } from 'react'
import type { Session } from '@supabase/supabase-js'
import { supabase } from '../lib/supabase'
import { Link } from '../lib/Link'
import { db as commonDb } from '../db'
import styles from './HomePage.module.css'

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
 * Pure shell content: who you are, the clubs you belong to
 * (including your own solo space), and a path to create a new
 * one. Per-gametype "Start X" affordances live on each club's
 * own page — once the user knows where their clubs are, "Start
 * wordknit" only makes sense inside a specific club, so this
 * page doesn't carry those buttons.
 *
 * Solo clubs (handle = `=<username>`) used to be hidden from
 * this list and surfaced as a separate "Play solo" section.
 * Now they're listed alongside regular clubs but visually
 * distinguished — see the `.soloItem` styles — and always
 * sorted to the top. The user's solo club is the default
 * landing spot for play-alone, and being a regular row in the
 * clubs list makes it discoverable without learning a separate
 * UI shape.
 *
 * Clubs RLS does the visibility filtering: the
 * `.from('clubs').select` below returns only the clubs the
 * caller is a member of. Solo clubs have only their owner as a
 * member, so the same query naturally surfaces each user's own
 * solo space without an `eq('created_by', …)` filter.
 */
export function HomePage({ session }: Props) {
  const [username, setUsername] = useState<string | null>(null)
  const [clubs, setClubs] = useState<ClubListEntry[]>([])

  // Load the caller's username for the greeting. Dep is the user id
  // (not the full session object), so background token refreshes —
  // which return a new Session reference with the same user — don't
  // trigger a refetch.
  useEffect(function loadUsername() {
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

  // Load every club the caller is a member of, including their
  // solo club. Sort newest-first; the render layer partitions
  // solo vs regular and renders solo on top of regulars
  // regardless of timestamp.
  useEffect(function loadClubs() {
    let mounted = true
    commonDb
      .from('clubs')
      .select('id, handle, name')
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

  // Partition: solo clubs (handle prefix '=') vs regular. The
  // prefix is the only reliable signal — handles are slugified
  // by `slugify_club_name` which strips '='-style chars, so no
  // user-created club can collide. See common.md → "Solo clubs".
  const soloClubs = clubs.filter((c) => c.handle.startsWith('='))
  const regularClubs = clubs.filter((c) => !c.handle.startsWith('='))

  return (
    <div className="card">
      <h1>Welcome{username ? `, ${username}` : ''}</h1>
      <p className="muted">{session.user.email}</p>

      <section>
        <h3>Your clubs</h3>
        {clubs.length === 0 ? (
          // Defensive: `handle_new_user` always materializes a
          // solo club, so this branch is essentially unreachable
          // — but a fetch failure or a future trigger regression
          // shouldn't render a blank list.
          <p className="muted">You haven't joined a club yet.</p>
        ) : (
          <ul className={styles.clubsList}>
            {soloClubs.map((c) => (
              <li key={c.id}>
                <Link to={`/c/${c.handle}`} className={styles.clubItem}>
                  <span className={styles.clubName}>{c.name}</span>
                  <span className={styles.soloBadge}>Solo</span>
                  <span className={styles.handle}>/c/{c.handle}</span>
                </Link>
              </li>
            ))}
            {regularClubs.map((c) => (
              <li key={c.id}>
                <Link to={`/c/${c.handle}`} className={styles.clubItem}>
                  <span className={styles.clubName}>{c.name}</span>
                  <span className={styles.handle}>/c/{c.handle}</span>
                </Link>
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
