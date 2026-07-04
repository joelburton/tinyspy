import {
  useMemo,
  type KeyboardEvent as ReactKeyboardEvent,
  type MouseEvent as ReactMouseEvent,
} from 'react'
import { useDefinePopover } from '../../../hooks/definitions/useDefinePopover'
import { useRecentlyFound } from '../../../hooks/game/useRecentlyFound'
import { colorVarFor } from '../../../lib/color/memberColor'
import { cls } from '../../../lib/util/cls'
import type { Member } from '../../../lib/games'
import styles from './WordList.module.css'

/**
 * One row of the shared word list, normalized so every word game renders the same
 * shape. A game builds these from its own found-word + reveal data (see each
 * game's `lib/displayRows`):
 *
 *   - **found** — a word someone found; `userId` colors its dot (the finder).
 *     `isBonus` adds a trailing '•'; `isPangram` bolds it (games without either
 *     concept just omit the flag).
 *   - **unfound** — a required word nobody found, shown only post-terminal (a
 *     hollow grey ring + grey word). Bonus words are never revealed, so an unfound
 *     row never carries `isBonus`.
 *
 * Rows arrive **pre-merged + alphabetized** (the game's builder dedups found words
 * to their first finder and shadows a found word over its reveal entry); this
 * component is pure presentation.
 */
export type WordListRow =
  | { kind: 'found'; word: string; userId: string; isBonus?: boolean; isPangram?: boolean }
  | { kind: 'unfound'; word: string; isPangram?: boolean }

type Props = {
  /** The merged, alphabetized rows (built by the game's `buildDisplayRows`). */
  rows: WordListRow[]
  /** Club members, for the finder-color lookup on each found row. */
  players: Member[]
  /**
   * Post-terminal reveal is active. Suppresses the recently-found flash — the
   * reveal refetch makes every peer row appear at once, which would otherwise
   * flash the whole list. Default `false`.
   */
  reveal?: boolean
  /** The card heading. Default "Words". */
  heading?: string
}

/**
 * The shared found-words list — one component for every word-hunt game
 * (spellingbee, boggle) so the list looks + behaves identically across games
 * (docs/ui.md → "Consistency across games"). A heading over a bordered scroll-box
 * card holding an alphabetical, **column-major** grid (down each column, then the
 * next to the right); the box is a fixed height, so three columns show and the
 * rest scroll horizontally.
 *
 * Each row leads with a **circle marker** carrying the attribution; the word text
 * itself is plain body-black, so finder identity reads from the dot, not the text:
 *
 *   - **Found words** lead with a filled ● in their finder's color, word in black.
 *   - **Unfound required words** (the post-terminal reveal) lead with a hollow ○ in
 *     grey, word also grey — "here's what the team / field missed."
 *
 * Three flags compose on top: **pangram** (bold), **bonus** (a trailing '•'), and
 * **recently found** (a finder-color underline that fades after 5s — mid-game
 * only, suppressed when `reveal` is set). Every word is click-to-define via the
 * shared `DefinitionPopover` — the word text itself is the target, not the whole
 * cell.
 */
export function WordList({ rows, players, reveal = false, heading = 'Words' }: Props) {
  // Color lookup by user_id. Players list is small (<10 in realistic clubs) so a
  // Map+get rather than .find on each row.
  const colorByUser = useMemo(() => {
    const m = new Map<string, string>()
    for (const p of players) m.set(p.user_id, colorVarFor(p.color))
    return m
  }, [players])

  // Just the found words for the useRecentlyFound input — the unfound reveal
  // entries arrive in bulk when the game terminalizes and would all flash at once.
  const foundWordsOnly = useMemo(
    () => rows.filter((r) => r.kind === 'found').map((r) => r.word),
    [rows],
  )
  const recentlyFound = useRecentlyFound(foundWordsOnly)

  // Click-to-define: clicking any word row opens a definition popover anchored to
  // that row. The open/anchor/close plumbing is the shared useDefinePopover hook.
  const { define: openDefine, popover } = useDefinePopover()

  /** Mouse + keyboard activation for a clickable word. Spread onto the word
   *  <span> itself (not the row) so only the word text — not the leading dot or
   *  the empty rest of the cell — opens the definition. */
  function wordActivation(word: string) {
    return {
      onClick: (e: ReactMouseEvent<HTMLSpanElement>) => openDefine(word, e.currentTarget),
      onKeyDown: (e: ReactKeyboardEvent<HTMLSpanElement>) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault()
          openDefine(word, e.currentTarget)
        }
      },
      role: 'button' as const,
      tabIndex: 0,
      title: 'Click to define',
    }
  }

  return (
    <div className={styles.wrapper}>
      <h3 className={styles.heading}>{heading}</h3>
      {/* The list in a bordered card — the same scroll-box chrome the shared
          TurnLog uses (a heading over an evident frame). */}
      <div className={styles.box}>
        <ul
          className={cls(
            styles.list,
            // Drop the column grid when there's nothing to lay out, so the
            // placeholder centers instead of sitting in a third-width cell.
            rows.length === 0 && styles.listEmpty,
          )}
        >
          {rows.length === 0 ? (
            <li className={styles.empty}>No words yet</li>
          ) : (
            rows.map((entry) => {
              // Unfound reveal entries — required words nobody found, only ever
              // post-terminal. Hollow grey ring + grey word.
              if (entry.kind === 'unfound') {
                return (
                  <li
                    key={entry.word}
                    className={cls(styles.row, styles.unfound, entry.isPangram && styles.pangram)}
                  >
                    <span className={cls(styles.dot, styles.dotUnfound)} aria-hidden="true">{'○'}</span>
                    <span className={styles.word} {...wordActivation(entry.word)}>{entry.word.toUpperCase()}</span>
                  </li>
                )
              }
              // A found word — a filled dot in its finder's color, word in black.
              const color = colorByUser.get(entry.userId) ?? 'var(--color-text)'
              // Recently-found flash is mid-game only (suppressed under reveal).
              const isRecent = !reveal && recentlyFound.has(entry.word)
              return (
                <li
                  key={entry.word}
                  className={cls(styles.row, entry.isPangram && styles.pangram, isRecent && styles.recent)}
                >
                  <span className={styles.dot} style={{ color }} aria-hidden="true">{'●'}</span>
                  {/* Word is plain black; only the dot carries finder color. The
                      recent-flash underline is set to the finder color inline (CSS
                      can't know it) — see `.recent .word`. */}
                  <span
                    className={styles.word}
                    style={isRecent ? { textDecorationColor: color } : undefined}
                    {...wordActivation(entry.word)}
                  >
                    {entry.word.toUpperCase()}
                  </span>
                  {/* Bonus words get a trailing bullet. Emitted as real text (not a
                      ::after) so it sits naturally inline. */}
                  {entry.isBonus && <span className={styles.bonusDot}>{' •'}</span>}
                </li>
              )
            })
          )}
        </ul>
      </div>
      {popover}
    </div>
  )
}
