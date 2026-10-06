// cs-fixed-outcome-fix

import type { Member } from '@/common/members/member'
import {
  EventLog,
  EventLogActor,
  EventLogOutcomeBar,
  EventLogNumber,
} from '@/common/event-log/EventLog'
import gameEventLog from '@/common/event-log/gameEventLog.module.css'
import {
  useEventLogPlayerPicker,
} from '@/common/event-log/useEventLogPlayerPicker'
import { eventToOutcome } from '../lib/answer'
import type { GEvent, GHistoryView } from '../types'
import { Tile } from './Tile'
import styles from './GameEventLog.module.css'

/**
 * The game log — every claim and every hint, on the shared `<EventLog>` (heading
 * + fixed-height bordered scroll box + table) so it reads like the other games'.
 *
 * **The tiles ARE the row.** A set written out — "2 red striped diamonds, 1
 * green solid oval, 3 purple open squiggles" — is unreadable at a glance and
 * three lines long; three tiny tiles say the same thing in a strip narrower
 * than a word. This is the one game whose log had to be pictures.
 *
 * A **claim** shows its three tiles; a **hint** shows the one, two or three the
 * asker was shown, tagged so it can't be mistaken for a find.
 *
 * ── The heading counts, and why they are not a scoreboard ───────────────────
 * The heading tallies whatever the filter is showing — `Found: 7 · Hints: 3`
 * for everyone, the same two numbers scoped when you pick a player. That is the
 * shared `<WordList>`'s own behavior ("filters become a reading tool"), and it
 * is what stands in for a per-player breakdown at the end: a breakdown is
 * PUSHED at the table whether or not anyone wanted the comparison, where a
 * filter is pulled by the person who went looking for it. Coop should not end
 * on a scoreboard nobody asked for.
 *
 * Compete's heading has no hints half, since there are none to count.
 */
export function GameEventLog({
  events,
  players,
  myId,
  mode,
  isGameEnded,
  historyView,
}: {
  // Every row, every player's — claims and hints, oldest first.
  events: GEvent[]
  players: Member[]
  myId: string
  mode: 'coop' | 'compete'
  isGameEnded: boolean
  historyView: GHistoryView
}) {
  const eventLogPicker = useEventLogPlayerPicker<GEvent>({
    players,
    myId,
    mode,
    isTerminal: isGameEnded,
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
      heading={mode === 'coop'
        ? `Found: ${found} · Hints: ${hints}`
        : `Found: ${found}`}
      picker={eventLogPicker}
      shown={shown}
    >
      {shown.map((event, i) => {
        // The NUMBER counts the rows on show — a filter renumbers them — while
        // the HANDLE is the row's own id.
        return (
          <tr key={event.id} className={gameEventLog.divider}>
            {/* The bar's word is `lib/answer.ts`'s — the log names none of its
                own, so it cannot disagree with the pill or a teammate's line
                about the same turn. */}
            <EventLogOutcomeBar outcome={eventToOutcome(event)}/>
            <EventLogNumber
              n={i + 1}
              isOpenInHistory={historyView.viewedEventId === event.id}
              onShowHistory={() => historyView.show(event.id, i + 1)}
            />
            <td className={styles.tiles}>
              {event.kind === 'hint' &&
                  <span className={styles.hintTag}>Hint:</span>}
              <span className={styles.mini}>
                {event.tiles.map((tile) => (
                  <Tile key={tile.id} tile={tile} readOnly/>
                ))}
              </span>
            </td>
            <EventLogActor actor={event.by}/>
          </tr>
        )
      })}
    </EventLog>
  )
}
