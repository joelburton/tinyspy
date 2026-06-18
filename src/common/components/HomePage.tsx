import { useEffect, useState } from 'react'
import type { Session } from '@supabase/supabase-js'
import { Link } from '../lib/Link'
import { db as commonDb } from '../db'
import { useProfile } from '../hooks/useProfile'
import styles from './HomePage.module.css'

type ClubListEntry = {
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
  const username = useProfile(session)?.username ?? null
  const [clubs, setClubs] = useState<ClubListEntry[]>([])

  // Load every club the caller is a member of, including their
  // solo club. Sort newest-first; the render layer partitions
  // solo vs regular and renders solo on top of regulars
  // regardless of timestamp.
  useEffect(function loadClubs() {
    let mounted = true
    commonDb
      .from('clubs')
      .select('handle, name')
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
        {/* Section header is a flex row: title on the left, the
            quiet "+ New club" button on the right. Creating a new
            club is the uncommon path (most users land here, click
            into an existing club, go play), so the button is
            outline-styled + small rather than competing with the
            primary accent-filled buttons elsewhere on the page. */}
        <header className={styles.sectionHeader}>
          <h3>Your clubs</h3>
          <Link to="/c/new" className={styles.newClubButton}>
            + New club
          </Link>
        </header>
        {clubs.length === 0 ? (
          // Defensive: claim_username materializes a solo club
          // atomically with the profile, so a signed-in claimed
          // user always has at least their solo club here. A fetch
          // failure or RLS regression shouldn't render a blank
          // list silently.
          <p className="muted">You haven't joined a club yet.</p>
        ) : (
          <ul className={styles.clubsList}>
            {soloClubs.map((c) => (
              <li key={c.handle}>
                <Link to={`/c/${c.handle}`} className={styles.clubItem}>
                  <span className={styles.clubName}>{c.name}</span>
                  <span className={styles.soloBadge}>Solo</span>
                  <span className={styles.handle}>/c/{c.handle}</span>
                </Link>
              </li>
            ))}
            {regularClubs.map((c) => (
              <li key={c.handle}>
                <Link to={`/c/${c.handle}`} className={styles.clubItem}>
                  <span className={styles.clubName}>{c.name}</span>
                  <span className={styles.handle}>/c/{c.handle}</span>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  )
}
