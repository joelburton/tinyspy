import { useEffect, useRef, type ReactNode } from 'react'
import { cls } from '../lib/cls'
import styles from './TurnLog.module.css'

/** The outcome a row's left bar paints. Shared across games:
 *  good (won/correct), bad (lost/wrong), partial (near/one-away), neutral. */
export type TurnOutcome = 'good' | 'bad' | 'partial' | 'neutral'

/**
 * The shared **turn log**: a game's per-turn history (one entry per turn — which
 * is per guess for most games, but a TinySpy turn can span several guesses). A
 * heading over an evident, fixed-height, bordered scroll box that auto-snaps to
 * the newest row like a chat panel.
 *
 * It's a **`<table>`** so each game's row pieces line up in columns *across*
 * rows (the number column, the who column, etc. all align) — which a flex/grid-
 * of-rows can't do. Each game supplies its own `<td>` cells inside a
 * {@link TurnLogEntry}; the entry prepends the shared outcome-bar cell. Compose
 * the cells from the content classes in `TurnLog.module.css` (`.primary` /
 * `.meta` / `.actor` / `.dot` / `.who`) rather than inventing ad-hoc ones, so
 * similar pieces read the same across games.
 *
 * Distinct from a **word list** (`<WordList>`, spellingbee/boggle), which is
 * alphabetical, not chronological. See docs/ui.md → "Turn log".
 */
export function TurnLog({
  heading,
  empty,
  emptyText = 'Nothing yet.',
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
  const boxRef = useRef<HTMLDivElement>(null)

  // Snap the box to the latest row whenever the rows change — same UX as
  // ChatBody. Simple: doesn't preserve a manual scroll-up (rarely felt, since
  // the player is usually watching their own action land).
  useEffect(
    function scrollToLatest() {
      const el = boxRef.current
      if (el) el.scrollTop = el.scrollHeight
    },
    [scrollKey],
  )

  return (
    <section className={cls(styles.panel, className)}>
      <h3 className={styles.heading}>{heading}</h3>
      <div ref={boxRef} className={styles.listBox}>
        {empty ? (
          <p className={cls('muted', styles.empty)}>{emptyText}</p>
        ) : (
          <table className={styles.table}>
            <tbody>{children}</tbody>
          </table>
        )}
      </div>
    </section>
  )
}

/**
 * One row in a {@link TurnLog}: a `<tr>` that prepends the shared **outcome-bar
 * cell** (a colored bar on the left, by outcome) and then renders the game's own
 * `<td>` cells (`children`). Rows are separated by a horizontal divider line
 * (the cells' shared bottom border); there are no vertical borders between
 * cells. `className` lets a game tweak the row if needed.
 */
export function TurnLogEntry({
  outcome,
  className,
  children,
}: {
  outcome: TurnOutcome
  className?: string
  children: ReactNode
}) {
  return (
    <tr className={cls(styles.entry, styles[`outcome_${outcome}`], className)}>
      {/* Real element (not just a styled empty cell) so the cell's width is
          honored and the bar can be sized/positioned reliably. */}
      <td className={styles.bar}>
        <span className={styles.barInner} />
      </td>
      {children}
    </tr>
  )
}
