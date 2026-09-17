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
 * **Pass the picker itself**, not its pieces: the dropdown on the heading row,
 * the empty state and its wording all come out of `useTurnLogPlayerPicker`, and
 * every game wired the same three by hand until they didn't (doc.md → Details).
 *
 *     const turnLogPicker = useTurnLogPlayerPicker({ players, selfId, mode, isTerminal })
 *     const shown = turnLogPicker.filter(rows)
 *     <TurnLog heading="Guesses" picker={turnLogPicker} shown={shown}> …the <tr>s… </TurnLog>
 */
export function TurnLog({
  heading,
  picker,
  shown,
  entryCount = shown.length,
  children,
}: {
  heading: string
  // The `useTurnLogPlayerPicker` result. The panel takes the whole thing because
  // two of the things it needs are in it — the dropdown for the heading row and
  // the honest empty wording — and a game that wires them separately can get
  // them out of step.
  picker: { dropdown: ReactNode; emptyText: string }
  // The entries on show — whatever the game will render as rows. The panel reads
  // only its LENGTH: empty when it is 0, and the scroll-to-newest key otherwise.
  // Taking the list rather than a count is what makes the count impossible to
  // mis-wire (a fresh array every render used to re-snap the log every second).
  shown: readonly unknown[]
  // Override for a game whose log grows by something other than one per entry.
  // codenamesduet is the case: an entry there is a TURN, and guesses land inside
  // a turn that already exists, so its turns alone would miss the snap.
  entryCount?: number
  // The game's `<tr>` rows (it owns their structure — see the component note).
  children: ReactNode
}) {
  const boxRef = useRef<HTMLDivElement>(null)

  // Snap the box to the latest row whenever the log grows — same UX as ChatBody.
  // Simple: doesn't preserve a manual scroll-up (rarely felt, since the player is
  // usually watching their own action land). A render that adds no entry leaves the
  // scroll where the player put it.
  useEffect(
    function scrollToLatest() {
      const el = boxRef.current
      if (el) el.scrollTop = el.scrollHeight
    },
    [entryCount],
  )

  return (
    <section className={styles.turnLog}>
      {/* Heading + the dropdown on one line. */}
      <div className={infoPanel.headerRow}>
        <h3 className={infoPanel.heading}>{heading}</h3>
        {picker.dropdown}
      </div>
      <div ref={boxRef} className={cls(infoPanel.box, styles.turnLogBox)}>
        {shown.length === 0 ? (
          <p className="emptyState">{picker.emptyText}</p>
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
 * wears the history blue ring (mirroring the board `.historyFrame`). It lives in the muted
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
 * takes no keystroke and Space falls through to `act-exit-history`. The
 * `data-turn-number` marker is how `useHistoryViewer`'s click-anywhere-to-exit
 * listener tells "the user is selecting a turn" from "the user clicked away".
 */
export function TurnLogNumber({
  n,
  isOpenInHistory,
  onShowHistory,
}: {
  // The turn ordinal shown after the "#" — each game's own (scrabble's `seq`,
  // codenamesduet's `turn_number`, stackdown/waffle's 1-based log position).
  n: number
  // Is this the turn currently open in the board viewer? Rings the number blue.
  isOpenInHistory: boolean
  // Open this turn on the board viewer.
  onShowHistory: () => void
}) {
  return (
    <td className={styles.meta}>
      <span
        className={cls(styles.turnNumber, isOpenInHistory && history.historyNumber)}
        title="Click to view this turn on the board"
        data-turn-number
        onClick={onShowHistory}
      >
        #{n}
      </span>
    </td>
  )
}
