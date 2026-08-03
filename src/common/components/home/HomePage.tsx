import { useEffect, useMemo, useRef, useState, type KeyboardEvent } from 'react'
import type { Session } from '@supabase/supabase-js'
import { Link } from '../../lib/routing/Link'
import { navigate } from '../../lib/routing/router'
import { cls } from '../../lib/util/cls'
import { useSwallowTab } from '../../hooks/input/useSwallowTab'
import { db as commonDb } from '../../db'
import { useProfile } from '../../hooks/session/useProfile'
import { useRealtimeRefetch } from '../../hooks/realtime/useRealtimeRefetch'
import { PuzpuzpuzWordmark } from '../branding/PuzpuzpuzWordmark'
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
 * connections" only makes sense inside a specific club, so this
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

  // Load every club the caller is a member of (incl. their solo club),
  // newest-first; the render layer partitions solo vs regular and puts
  // solo on top regardless of timestamp.
  //
  // Subscribed to MY clubs_members rows so the list stays live: when a
  // friend accepts an invite and I add them — or when I'm added to /
  // removed from a club — the INSERT/DELETE on my membership refetches
  // the list, no manual page refresh. (The removal DELETE reaches me via
  // the `user_id = auth.uid()` arm of clubs_members_select; see that
  // policy.) SUBSCRIBED-refetch also heals any events missed offline.
  useRealtimeRefetch({
    tables: {
      schema: 'common',
      table: 'clubs_members',
      filter: `user_id=eq.${session.user.id}`,
    },
    channelPrefix: 'home-clubs',
    id: session.user.id,
    load: async ({ mounted }) => {
      const { data, error } = await commonDb
        .from('clubs')
        .select('handle, name')
        .order('created_at', { ascending: false })
      if (!mounted()) return
      if (error) {
        console.error('failed to load clubs', error)
        return
      }
      setClubs(data ?? [])
    },
  })

  // Partition: solo clubs (handle prefix '=') vs regular. The
  // prefix is the only reliable signal — handles are slugified
  // by `slugify_club_name` which strips '='-style chars, so no
  // user-created club can collide. See common.md → "Solo clubs".
  //
  // Flattened into ONE display-ordered array (solo first) because the keyboard
  // cursor below indexes it: the cursor and the rendered rows have to walk the
  // same order, so there's exactly one list and it renders from this.
  const ordered = useMemo(
    () => [
      ...clubs.filter((c) => c.handle.startsWith('=')),
      ...clubs.filter((c) => !c.handle.startsWith('=')),
    ],
    [clubs],
  )

  // ─── Keyboard navigation ─────────────────────────────────────────────────
  // The same shape ClubPage uses for its two lists: the LIST holds focus, and
  // Up/Down move a cursor ring through the rows with Enter opening the one
  // under it. The rows stay ordinary links, so clicking is unchanged.
  //
  // Tab does NOTHING on this page (useSwallowTab). Arrows + Enter are the whole
  // keyboard story, and native Tab only led away from it — onto the header menu
  // and then out into the browser's URL bar. The trade-off is deliberate: the
  // "+ New club" link is no longer keyboard-reachable from here. An open
  // <Menu> is unaffected — it stopPropagation()s its own keys, so Tab still
  // closes it.
  useSwallowTab()

  const listRef = useRef<HTMLUListElement>(null)
  const [cursor, setCursor] = useState(0)
  // Tracked on the container proper (not a bubbled child focus) so tabbing on
  // to a row's link doesn't leave a stale ring pointing somewhere else.
  const [listFocused, setListFocused] = useState(false)

  // The row the ring is ON: clamped to the live list length (it can shrink
  // under us — the club list is realtime), and hidden entirely unless the
  // container holds focus. -1 = no ring.
  const kbCursor =
    listFocused && ordered.length > 0 ? Math.min(cursor, ordered.length - 1) : -1

  function onListKeyDown(e: KeyboardEvent) {
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      e.preventDefault() // don't ALSO scroll the page
      const delta = e.key === 'ArrowDown' ? 1 : -1
      // Clamp to the ends — deliberately no wrap-around, matching ClubPage.
      setCursor((c) =>
        Math.max(0, Math.min(ordered.length - 1, Math.min(c, ordered.length - 1) + delta)),
      )
    } else if (e.key === 'Enter') {
      e.preventDefault()
      const club = ordered[Math.min(cursor, ordered.length - 1)]
      if (club) navigate(`/c/${club.handle}`)
    }
  }

  // Focus the list on arrival so arrows work without a first Tab — the same
  // welcome ClubPage gives its start list. Waits for the clubs to land (the
  // list doesn't exist before that) and yields to anything already focused.
  // preventScroll: the list is near the top anyway and a focus-scroll would
  // just jitter the page.
  useEffect(
    function focusListOnLoad() {
      if (ordered.length === 0) return
      const el = listRef.current
      const idle =
        document.activeElement === null || document.activeElement === document.body
      if (el && idle) el.focus({ preventScroll: true })
    },
    [ordered.length],
  )

  return (
    <div className="card">
      <PuzpuzpuzWordmark />
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
          <ul
            ref={listRef}
            className={styles.clubsList}
            tabIndex={0}
            role="group"
            aria-label="Your clubs"
            onKeyDown={onListKeyDown}
            onFocus={(e) => {
              if (e.target === e.currentTarget) setListFocused(true)
            }}
            onBlur={(e) => {
              if (e.target === e.currentTarget) setListFocused(false)
            }}
          >
            {ordered.map((c, i) => (
              // Clicking IS selecting, so the mouse and the keyboard agree on
              // "the selected club". On the <li> because <Link> owns its own
              // onClick for routing; the row's click bubbles here first. This
              // list navigates away on click, so it's the same symmetry
              // ClubPage's game list has rather than something you'd notice
              // here today.
              <li key={c.handle} onClick={() => setCursor(i)}>
                <Link
                  to={`/c/${c.handle}`}
                  className={cls(styles.clubItem, i === kbCursor && styles.kbCursor)}
                >
                  {/* Name + (for a solo club) its pill, and nothing else. The
                      row used to end with the club's `/c/<handle>` URL — the
                      same thing ClubPage dropped from its own body: it's what
                      the browser's address bar will say the moment you click,
                      and a monospace URL is a developer's view of a venue the
                      friends know by name. */}
                  <span className={styles.clubName}>{c.name}</span>
                  {c.handle.startsWith('=') && <span className={styles.soloBadge}>Solo</span>}
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  )
}
