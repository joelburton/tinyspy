// cs-fixed-outcome-fix

import type { Member } from '@/common/members/member'
import { cls } from '@/common/utils/cls'
import { EventLog, EventLogActor, EventLogOutcomeBar, EventLogNumber } from '@/common/event-log/EventLog'
import gameEventLog from '@/common/event-log/gameEventLog.module.css'
import { DefinableWord } from '@/common/definitions/DefinableWord'
import { useEventLogPlayerPicker } from '@/common/event-log/useEventLogPlayerPicker'
import { ANSWER_OUTCOME, answerOf } from '../lib/answer'
import type { GEvent, GHistoryView } from '../types'
import styles from './GameEventLog.module.css'

/**
 * The submission log — the info-column history of every play, rendered on the
 * shared `<EventLog>` (heading + fixed-height bordered scroll box + table) so it
 * reads the same as the other games' logs. It isn't strictly a "found words"
 * list: it's chronological and carries invalid attempts and cheat requests too,
 * so it's a **event log**, not a `<WordList>`. Each submission is one `<tr>` with
 * the shared outcome bar, whose color is `lib/answer.ts`'s — the bar never names
 * a word of its own, so it cannot disagree with the pill that reported the same
 * turn. The row's text is this log's:
 *
 *   - a **valid** word    → the word, clickable to define;
 *   - an **invalid** word → struck through + tagged "not a word";
 *   - a **cheat request**  → the "Hint: …" / "Spoiler: …" row.
 *
 * All three are durable rows in `stackdown.events` (this is just a
 * projection of `gd.events`). Every row is numbered #1, #2, … in order — including
 * the cheat requests, so asking for a hint reads as having "cost a turn" rather
 * than being free.
 *
 * Every row names its player (the shared `<ActorDot>`), unconditionally — the
 * v3 log shape. **Whose rows** are shown is picked by the shared
 * `useEventLogPlayerPicker` dropdown in the header, one vocabulary across every
 * event-log game: solo is your handle, coop is "Team" plus each player, compete
 * is "All" plus each player. In compete a rival's rows are withheld during
 * the race and open at its end, which is what the picker's empty text says.
 *
 * Click-to-define: a valid (real) word opens the shared `DefinitionPopover` (the
 * common read-through cache → Wiktionary lookup every word game gets). Invalid
 * attempts aren't real words, so they stay inert.
 */
export function GameEventLog({
  events,
  players,
  myId,
  mode,
  isGameEnded,
  historyView,
}: {
  /** Every turn I may see. Coop: the whole shared game. Compete: my own while
   *  the race is on, and everyone's once it has ended. */
  events: GEvent[]
  players: Member[]
  myId: string
  mode: 'coop' | 'compete'
  /** Distinguishes a rival's withheld log from a genuinely empty one. */
  isGameEnded: boolean
  historyView: GHistoryView
}) {
  const eventLogPicker = useEventLogPlayerPicker<GEvent>({
    players,
    myId,
    mode,
    isTerminal: isGameEnded,
    emptyLabel: 'No words yet.',
  })
  const shown = eventLogPicker.filter(events)

  return (
    <EventLog heading="Turns" picker={eventLogPicker} shown={shown}>
      {shown.map((e, i) => (
        // Every turn is its own row; the divider draws the between-rows line
        // (:first-child suppresses it on the first row).
        <tr key={e.id} className={gameEventLog.divider}>
          <EventLogOutcomeBar outcome={ANSWER_OUTCOME[answerOf(e)]} />
          {/* The "#N" handle opens that turn on the board viewer. The number
              counts the rows on show — a filter renumbers them — while the
              handle is the row's own id, so it always opens the row its
              number sits beside. */}
          <EventLogNumber
            n={i + 1}
            isOpenInHistory={historyView.viewedEventId === e.id}
            onShowHistory={() => historyView.show(e.id, i + 1)}
          />
          <td className={gameEventLog.main}>
            <Turn event={e} />
          </td>
          <EventLogActor actor={e.by} />
        </tr>
      ))}
    </EventLog>
  )
}

/** A row's text: a valid word definable, a refused one struck through, a hint
 *  its clue and a spoiler the word it handed over. */
function Turn({ event: e }: { event: GEvent }) {
  if (e.kind === 'hint') return <span className={styles.request}>Hint: {e.clue}</span>
  if (e.kind === 'spoiler') {
    return <span className={styles.request}>Spoiler: {e.word!.toUpperCase()}</span>
  }
  if (e.valid) return <DefinableWord word={e.word!} className={gameEventLog.primary} />
  // An invalid attempt — struck through + tagged (the red bar already carries
  // the "rejected" signal).
  return (
    <>
      <span className={cls(gameEventLog.primary, styles.invalidWord)}>
        {e.word!.toUpperCase()}
      </span>{' '}
      <span className={styles.tag}>not a word</span>
    </>
  )
}
