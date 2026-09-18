// cs-blessed-event-log

import { useEffect, useRef, type ComponentProps, type ReactNode } from 'react'
import { cls } from '../utils/cls'
import { ActorDot } from '../members/ActorMention'
import type { Outcome } from '../outcomes/outcomes'
import infoPanel from '../info-sheet/infoPanel.module.css'
import styles from './EventLog.module.css'
import history from './historyViewer.module.css'

/**
 * The shared **event log** — a game's account of what happened, one entry per turn
 * (which is per guess for most games, but a codenamesduet turn can span several).
 * Reach for it when a game's readout is chronological; `<WordList>` is the
 * alphabetical counterpart. A heading over an evident, fixed-height, bordered
 * scroll box that auto-snaps to the newest row like a chat panel.
 *
 * **The panel owns no row.** Its children ARE the `<tr>`s the game renders, built
 * from this folder's atoms (`<EventLogOutcomeBar>`, `<EventLogNumber>`, `<EventLogActor>`)
 * and the sizing/emphasis classes in `gameEventLog.module.css`. The only shared
 * contract is "a event-log item is a `<tr>` inside this table" — doc.md says why.
 *
 * **Pass the picker itself**, not its pieces: the dropdown on the heading row,
 * the empty state and its wording all come out of `useEventLogPlayerPicker`, and
 * the panel draws both itself, so there is nothing to wire (doc.md → Details).
 *
 *     const eventLogPicker = useEventLogPlayerPicker({ players, selfId, mode, isTerminal })
 *     const shown = eventLogPicker.filter(rows)
 *     <EventLog heading="Guesses" picker={eventLogPicker} shown={shown}> …the <tr>s… </EventLog>
 */
export function EventLog({
  heading,
  picker,
  shown,
  entryCount = shown.length,
  children,
}: {
  heading: string
  // The `useEventLogPlayerPicker` result. The panel takes the whole thing because
  // two of the things it needs are in it — the dropdown for the heading row and
  // the honest empty wording — and a game that wires them separately can get
  // them out of step.
  picker: { dropdown: ReactNode; emptyText: string }
  // The entries on show — whatever the game will render as rows. The panel reads
  // only its LENGTH: empty when it is 0, and the scroll-to-newest key otherwise.
  // Taking the list rather than a count is what makes the count impossible to
  // mis-wire: a fresh array as the key would re-snap the log on every render.
  shown: readonly unknown[]
  // Override for a game whose log grows by something other than one per entry.
  // codenamesduet is the case: an entry there is a TURN, and guesses land inside
  // a turn that already exists, so its turns alone would miss the snap.
  entryCount?: number
  // The game's `<tr>` rows (it owns their structure — see the component note).
  children: ReactNode
}) {
  const boxRef = useRef<HTMLDivElement>(null)

  // Snap the box to the latest row whenever the log GROWS — same UX as ChatBody.
  // Growth wins over a manual scroll-up (rarely felt, since the player is usually
  // watching their own action land); any other render leaves the scroll where the
  // player put it, which is why the key is a count and not the rows.
  useEffect(
    function scrollToLatest() {
      const el = boxRef.current
      if (el) el.scrollTop = el.scrollHeight
    },
    [entryCount],
  )

  return (
    <section className={styles.eventLog}>
      {/* Heading + the dropdown on one line. */}
      <div className={infoPanel.headerRow}>
        <h3 className={infoPanel.heading}>{heading}</h3>
        {picker.dropdown}
      </div>
      <div ref={boxRef} className={cls(infoPanel.box, styles.eventLogBox)}>
        {shown.length === 0 ? (
          <p className="emptyState">{picker.emptyText}</p>
        ) : (
          <table className={styles.eventLogTable}>
            <tbody>{children}</tbody>
          </table>
        )}
      </div>
    </section>
  )
}

/**
 * The shared **outcome-bar cell** — a colored left bar by outcome, the one row
 * piece common to every game's event log. It's a `<td>`, so a game drops it into
 * whatever row markup it builds (it is *not* "the row"); its styling is
 * self-contained and doesn't depend on the `<tr>` carrying any class.
 *
 * `rowSpan` lets a multi-row turn (codenamesduet's clue + guess line) have the
 * bar cover the whole turn — pass the number of rows it spans; omit for a normal
 * single-row turn.
 */
export function EventLogOutcomeBar({
  outcome,
  rowSpan,
}: {
  // ANY outcome. There is no event-log outcome type and there must not be one: a
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
 * The event-log **"#N"** — every row's turn number, and the turn-history control
 * when it can be one. Pass `onShowHistory` and it becomes a click target that
 * opens that turn on the board; omit it and the same number draws plain. They
 * are the same thing, and a game does not hand-write the inert case.
 *
 * A game omits the handler when the log on show is not the sequence the board
 * replays — a filtered log's row 3 is not the board's turn 3 (the picker's
 * `boardIsShown`). doc.md → Details has the seam.
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
 * `data-history-handle` marker is how `useHistoryViewer`'s click-anywhere-to-exit
 * listener tells "the user is selecting a turn" from "the user clicked away".
 */
export function EventLogNumber({
  n,
  isOpenInHistory = false,
  onShowHistory,
}: {
  // The turn ordinal shown after the "#" — each game's own (scrabble's `seq`,
  // codenamesduet's `turn_number`, stackdown/waffle's 1-based log position).
  n: number
  // Is this the turn currently open in the board viewer? Rings the number blue.
  // Meaningless without `onShowHistory`, since an inert number opens nothing.
  isOpenInHistory?: boolean
  // Open this turn on the board viewer. OMITTED = this number opens nothing, and
  // draws as a plain one.
  onShowHistory?: () => void
}) {
  if (!onShowHistory) return <td className={styles.turnNumber}>#{n}</td>

  return (
    <td className={styles.turnNumber}>
      <span
        className={cls(styles.turnNumberHandle, isOpenInHistory && history.historyNumber)}
        data-tooltip="Click to view this turn on the board"
        data-history-handle
        onClick={onShowHistory}
      >
        #{n}
      </span>
    </td>
  )
}

/**
 * The event-log **"who" cell** — the right-aligned `<td>` (the `.who` column, which
 * shrinks to its content so the discs line up down the log) wrapping the shared
 * `<ActorDot>`. Every game's row ends this way, so the column and the tag are
 * single-sourced together. Props forward straight to `<ActorDot>`.
 */
export function EventLogActor(props: ComponentProps<typeof ActorDot>) {
  return (
    <td className={styles.who}>
      <ActorDot {...props} />
    </td>
  )
}
