import { useEffect, useRef, type ReactNode } from 'react'
import { cls } from '../lib/cls'
import styles from './HistoryPanel.module.css'

/** The outcome a row's left strip paints. `oneAway` is connections-only; the
 *  others are shared. */
export type Verdict = 'correct' | 'wrong' | 'oneAway'

/**
 * The shared side-column "history log" shell: a heading over an
 * internally-scrolling list of verdict-strip cards, auto-snapping to the latest
 * row like a chat panel. Factored out of the per-game `GuessHistory` components
 * (connections + psychicnum), which had grown the same structure + scroll effect +
 * card chrome side by side.
 *
 * What's shared: the section/heading/empty-state/scroll-frame skeleton, the
 * scroll-to-latest behavior, and the card + outcome-strip look (`<HistoryRow>`).
 * What stays per-game: the ROW CONTENT (a connections row shows tiles; a psychicnum
 * row shows the guessed number) and the column's outer width/flex, passed via
 * `className`.
 *
 * Not every game's log fits this shape — tinyspy's GameLog deliberately uses
 * divider-separated turns rather than strip cards, and scrabble's framed
 * PlayLog has its own chrome. This is for the strip-card "guess log" family.
 */
export function HistoryPanel({
  heading,
  empty,
  emptyText = 'No guesses yet.',
  scrollKey,
  className,
  children,
}: {
  heading: string
  /** True when there are no rows — renders the muted empty state instead. */
  empty: boolean
  emptyText?: string
  /** Changes whenever the rows change (e.g. the rows array, or its length);
   *  drives the scroll-to-latest effect. */
  scrollKey: unknown
  /** Merged onto the `<section>` — each game passes its own column flex/width. */
  className?: string
  children: ReactNode
}) {
  const listRef = useRef<HTMLOListElement>(null)

  // Snap the list to the latest row whenever the rows change — same UX as
  // ChatBody. Simple: doesn't preserve a manual scroll-up (rarely felt, since
  // the player is usually watching their own action land).
  useEffect(
    function scrollToLatest() {
      const el = listRef.current
      if (el) el.scrollTop = el.scrollHeight
    },
    [scrollKey],
  )

  return (
    <section className={cls(styles.panel, className)}>
      <h3 className={styles.heading}>{heading}</h3>
      {empty ? (
        <p className="muted">{emptyText}</p>
      ) : (
        <ol ref={listRef} className={styles.list}>
          {children}
        </ol>
      )}
    </section>
  )
}

/**
 * One row in a {@link HistoryPanel}: a transparent card with the outcome painted
 * as a colored left strip. The row's content is `children` (game-specific);
 * `className` lets a game add its own row layout (e.g. psychicnum lays the
 * number + meta out side by side).
 */
export function HistoryRow({
  verdict,
  className,
  children,
}: {
  verdict: Verdict
  className?: string
  children: ReactNode
}) {
  return (
    <li className={cls(styles.item, styles[`item_${verdict}`], className)}>
      {children}
    </li>
  )
}
