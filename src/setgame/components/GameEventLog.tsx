// cs-fixed-outcome-fix

import type { Member } from '@/common/members/member'
import { memberById } from '@/common/members/memberList'
import { EventLog, EventLogActor, EventLogOutcomeBar, EventLogNumber } from '@/common/event-log/EventLog'
import gameEventLog from '@/common/event-log/gameEventLog.module.css'
import { useEventLogPlayerPicker } from '@/common/event-log/useEventLogPlayerPicker'
import { ANSWER_OUTCOME } from '../lib/answer'
import type { EventRow } from '../hooks/useGame'
import { Card } from './Card'
import styles from './GameEventLog.module.css'

/**
 * The game log — every claim and every hint, on the shared `<EventLog>` (heading
 * + fixed-height bordered scroll box + table) so it reads like the other games'.
 *
 * **The cards ARE the row.** A set written out — "2 red striped diamonds, 1
 * green solid oval, 3 purple open squiggles" — is unreadable at a glance and
 * three lines long; three tiny cards say the same thing in a strip narrower
 * than a word. This is the one game whose log had to be pictures.
 *
 * A **claim** shows its three cards; a **hint** shows the one, two or three the
 * asker was shown, tagged so it can't be mistaken for a find.
 *
 * ── The heading counts, and why they are not a scoreboard ───────────────────
 * The heading tallies whatever the filter is showing — `Found: 7 · Hints: 3`
 * for everyone, the same two numbers scoped when you pick a player. That is the
 * shared `<WordList>`'s own behavior ("filters become a reading tool"), and it
 * is what replaced a per-player breakdown at the terminal: a breakdown is
 * PUSHED at the table whether or not anyone wanted the comparison, where a
 * filter is pulled by the person who went looking for it. Coop should not end
 * on a scoreboard nobody asked for.
 *
 * Compete's heading has no hints half, since there are none to count.
 */
export function GameEventLog({
  events,
  players,
  selfId,
  mode,
  isTerminal,
  historyId,
  onShowHistory,
}: {
  /** Every event the viewer can see — claims and hints, oldest first. */
  events: EventRow[]
  players: Member[]
  selfId: string
  mode: 'coop' | 'compete'
  isTerminal: boolean
  /** The event currently open in the board viewer (highlights its row), or
   *  null. The row's own id — see lib/history.ts. */
  historyId: number | null
  /** Open an event in the board viewer — the row's id, and the `#N` this log
   *  printed beside it, which is what the banner shows back. */
  onShowHistory: (id: number, n: number) => void
}) {
  const eventLogPicker = useEventLogPlayerPicker<EventRow>({
    players,
    selfId,
    mode,
    isTerminal,
    // setgame's compete race happens on ONE shared board, like scrabble's — so
    // "All" is literally what you are looking at, and the per-player entries
    // are the extra rather than the default.
    competeSharesOneGame: true,
  })

  const shown = eventLogPicker.filter(events)
  const found = shown.filter((e) => e.kind === 'claim').length
  const hints = shown.filter((e) => e.kind === 'hint').length

  return (
    <EventLog
      heading={mode === 'coop' ? `Found: ${found} · Hints: ${hints}` : `Found: ${found}`}
      picker={eventLogPicker}
      shown={shown}
    >
      {shown.map((event, i) => {
        // The NUMBER counts the rows on show — 1, 2, 3 under whatever filter is
        // applied, which from the reader's seat is honest. The HANDLE is the
        // row's own id. (This reverses a decision recorded here: the number used
        // to be the position in the FULL log, on the grounds that a filter must
        // not renumber the game. Under the shared rule it numbers the list you
        // are looking at, and the id is what identifies a row.)
        return (
          <tr key={event.id} className={gameEventLog.divider}>
            {/* The bar's word is `lib/answer.ts`'s, and the row's `kind` is
                already its key — so the log has no word of its own to disagree
                with the pill or a teammate's line about the same turn. */}
            <EventLogOutcomeBar outcome={ANSWER_OUTCOME[event.kind]} />
            <EventLogNumber
              n={i + 1}
              isOpenInHistory={historyId === event.id}
              onShowHistory={() => onShowHistory(event.id, i + 1)}
            />
            <td className={styles.cards}>
              {event.kind === 'hint' && <span className={styles.hintTag}>Hint:</span>}
              <span className={styles.mini}>
                {event.cards.map((card) => (
                  <Card key={card} card={card} readOnly />
                ))}
              </span>
            </td>
            <EventLogActor actor={memberById(players, event.user_id)} />
          </tr>
        )
      })}
    </EventLog>
  )
}
