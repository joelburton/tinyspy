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
 * rows. But the **row anatomy is the game's** — how many `<tr>`s a turn is, how
 * many cells, what spans — because that genuinely differs game to game (a one-row
 * three-column guess, a two-row clue-then-guesses turn, a row with an inline
 * mini-board…). So `<TurnLog>` makes **no** assumption about rows: its children
 * are the `<tr>`s the game renders. The only shared contract is "a turn-log item
 * is a `<tr>` inside this table."
 *
 * What IS shared is *vocabulary a game composes into its own rows*, so logs look
 * consistent without imposing structure:
 *   - **`<TurnLogBar>`** — the colored outcome-bar cell (optional; most games
 *     include it, but a game's row needn't).
 *   - the content classes in `TurnLog.module.css` (`.primary` / `.meta` /
 *     `.who` / `.actor` / `.dot`), and `.turnLogDivider` for the between-turns
 *     line.
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
  /** Optional extra class merged onto the root. The panel already fills its
   *  flex parent (`flex: 1` on `.turnLog`); this is only for a rare per-game
   *  override (a different width/flex). */
  className?: string
  /** The game's `<tr>` rows (it owns their structure — see the component note). */
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
    <section className={cls(styles.turnLog, className)}>
      <h3 className={styles.turnLogHeading}>{heading}</h3>
      <div ref={boxRef} className={styles.turnLogBox}>
        {empty ? (
          <p className={cls('muted', styles.turnLogEmpty)}>{emptyText}</p>
        ) : (
          <table className={styles.turnLogTable}>
            <tbody>{children}</tbody>
          </table>
        )}
      </div>
    </section>
  )
}

/**
 * The shared **outcome-bar cell** — a colored left bar by outcome, the one row
 * piece common to every game's turn log. It's a `<td>`, so a game drops it into
 * whatever row markup it builds (it is *not* "the row"); its styling is
 * self-contained and doesn't depend on the `<tr>` carrying any class.
 *
 * `rowSpan` lets a multi-row turn (codenamesduet's clue + guess line) have the
 * bar cover the whole turn — pass the number of rows it spans; omit for a normal
 * single-row turn.
 */
export function TurnLogBar({
  outcome,
  rowSpan,
}: {
  outcome: TurnOutcome
  rowSpan?: number
}) {
  return (
    // Real element (not a styled empty cell) so its width is honored and the bar
    // can be sized/positioned reliably.
    <td className={styles.bar} rowSpan={rowSpan}>
      <span className={cls(styles.barInner, styles[`barInner_${outcome}`])} />
    </td>
  )
}
