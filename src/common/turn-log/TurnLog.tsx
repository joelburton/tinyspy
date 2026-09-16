// cs-met-turn-log

import { useEffect, useRef, type ReactNode } from 'react'
import { cls } from '../utils/cls'
import type { Outcome } from '../outcomes/outcomes'
import infoPanel from '../info-sheet/infoPanel.module.css'
import styles from './TurnLog.module.css'
import history from './historyViewer.module.css'

/**
 * The shared **turn log** — a game's account of what happened, one entry per turn
 * (which is per guess for most games, but a codenamesduet turn can span several).
 * Reach for it when a game's readout is chronological; `<WordList>` is the
 * alphabetical counterpart. A heading over an evident, fixed-height, bordered
 * scroll box that auto-snaps to the newest row like a chat panel.
 *
 * **The panel owns no row.** Its children ARE the `<tr>`s the game renders, built
 * from this folder's atoms (`<TurnLogBar>`, `<TurnLogNumber>`, `<TurnLogActor>`)
 * and the sizing/emphasis classes in `TurnLog.module.css`. The only shared
 * contract is "a turn-log item is a `<tr>` inside this table" — doc.md says why.
 *
 * `useTurnLogPlayerPicker` supplies `headerAction`, `empty` and `emptyText`
 * together; its docstring has the call.
 */
export function TurnLog({
  heading,
  headerAction,
  empty,
  emptyText = 'Nothing yet.',
  scrollKey,
  className,
  children,
}: {
  heading: string
  // Control rendered right-aligned on the heading row — in practice always the
  // `useTurnLogPlayerPicker` dropdown.
  headerAction?: ReactNode
  // True when there are no rows — renders the muted empty state instead.
  empty: boolean
  emptyText?: string
  // Changes whenever the rows change (e.g. the rows array, or its length);
  // drives the scroll-to-latest effect.
  scrollKey: unknown
  // Optional extra class merged onto the root. The panel already fills its flex
  // parent (`flex: 1` on `.turnLog`); this is only for a per-game override (a
  // different width/flex).
  className?: string
  // The game's `<tr>` rows (it owns their structure — see the component note).
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
      {/* Heading + a right-aligned control on one line. */}
      {headerAction ? (
        <div className={infoPanel.headerRow}>
          <h3 className={infoPanel.heading}>{heading}</h3>
          {headerAction}
        </div>
      ) : (
        <h3 className={infoPanel.heading}>{heading}</h3>
      )}
      <div ref={boxRef} className={cls(infoPanel.box, styles.turnLogBox)}>
        {empty ? (
          <p className="emptyState">{emptyText}</p>
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
  // ANY outcome. There is no turn-log outcome type and there must not be one: a
  // map covering only the words one game happened to use is what forces the next
  // game to squeeze its answer into somebody else's three, which is how a log
  // ends up disagreeing with the pill about the same event.
  outcome: Outcome
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

/**
 * The turn-log **"#N" handle** — the shared turn-history control. Clicking it opens
 * that turn on the board viewer; when that turn is the one being viewed, the number
 * wears the history blue ring (mirroring the board `.frame`). It lives in the muted
 * `.meta` column, so a game drops it in where it rendered a bare `#N` cell.
 *
 * **Why the number, not the whole row.** Many games render a turn as SEVERAL `<tr>`s
 * (codenamesduet's clue + guess rows). A whole-row "viewing" outline then draws a
 * broken box across those rows, and a per-row hover lights only half the turn. A
 * single small handle stays crisp no matter how many rows a turn spans — so every
 * history game hangs its click + outline here, and they all read identically.
 *
 * **A `<span>`, not a `<button>`, on purpose.** A focused button re-fires its click
 * on Space — so pressing Space to leave the viewer (the shared "any key exits")
 * would instead re-select the turn. A span with an `onClick` isn't focusable, so it
 * takes no keystroke and Space falls through to `act-exit-viewer`. The
 * `data-turn-number` marker is how `useHistoryViewer`'s click-anywhere-to-exit
 * listener tells "the user is selecting a turn" from "the user clicked away".
 */
export function TurnLogNumber({
  n,
  viewing,
  onSelect,
}: {
  // The turn ordinal shown after the "#" — each game's own (scrabble's `seq`,
  // codenamesduet's `turn_number`, stackdown/waffle's 1-based log position).
  n: number
  // Is this the turn currently open in the board viewer? Rings the number blue.
  viewing: boolean
  // Open this turn on the board viewer.
  onSelect: () => void
}) {
  return (
    <td className={styles.meta}>
      <span
        className={cls(styles.turnNumber, viewing && history.viewedNumber)}
        title="Click to view this turn on the board"
        data-turn-number
        onClick={onSelect}
      >
        #{n}
      </span>
    </td>
  )
}
