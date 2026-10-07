// cs-fixed-outcome-fix

import { EventLog, EventLogActor, EventLogOutcomeBar, EventLogNumber } from '@/common/event-log/EventLog'
import gameEventLog from '@/common/event-log/gameEventLog.module.css'
import { useEventLogPlayerPicker } from '@/common/event-log/useEventLogPlayerPicker'
import type { Member } from '@/common/members/member'
import { eventToOutcome } from '../lib/answer'
import { coord } from '../lib/waffle'
import type { GEvent, GHistoryView } from '../types'
import styles from './GameEventLog.module.css'

type Props = {
  // Every swap the viewer can see (`gd.events`). Coop: the whole shared game.
  // Compete: your own during play, and everyone's once the game has ended.
  events: GEvent[]
  players: Member[]
  myId: string
  mode: 'coop' | 'compete'
  // Distinguishes a rival's withheld log from a genuinely empty one.
  isGameEnded: boolean
  // The swap open on the board: its `#N` wears the history-blue ring, and a
  // `#N` click opens another.
  historyView: GHistoryView
}

/**
 * waffle's event log — the shared swap history rendered with the common
 * `<EventLog>` table (same chrome psychicnum / connections / codenamesduet use).
 * waffle renders its OWN `<tr>` rows (docs/playarea.md → Event log), composing the
 * shared `<EventLogOutcomeBar>` + content classes. Every row is a swap, and
 * its bar's color is `lib/answer.ts`'s.
 *
 * One `<tr>`, four real `<td>` columns (so they align down the log — never stacked
 * divs, which throw away the column alignment the table exists for): the outcome
 * bar, the turn number ("#N", `<EventLogNumber>`), the move ("A (A1) ↔ B (C2)" —
 * swapped letters leading, coordinates receding — in `.main` so it absorbs the
 * row's slack), and the swapper right-aligned in `<EventLogActor>`. `.divider`
 * draws the between-turns line.
 *
 * **Both modes.** Whose swaps show is picked by the shared
 * `useEventLogPlayerPicker` — solo is your handle, coop is "Team" plus each
 * player, compete is "All" plus each player. In compete a rival's rows are
 * withheld during play (`useGame`'s seat rule) and arrive once the game ends,
 * which is what the picker's empty text says — and opening one of theirs then
 * rebuilds THEIR board from the shared deal, which is the point of having
 * their swaps at all.
 *
 * Stateless + presentational — the shared `<EventLog>` snaps to the latest row.
 */
export function GameEventLog({
  events,
  players,
  myId,
  mode,
  isGameEnded,
  historyView,
}: Props) {
  const eventLogPicker = useEventLogPlayerPicker<GEvent>({
    players,
    myId,
    mode,
    isGameEnded,
    label: 'Whose swaps to show',
    emptyLabel: 'No swaps yet.',
  })
  const shown = eventLogPicker.filter(events)

  return (
    <EventLog heading="Swaps" picker={eventLogPicker} shown={shown}>
      {shown.map((swap, i) => {
        const [a, b] = swap.swaps
        return (
          <tr key={swap.id} className={gameEventLog.divider}>
            <EventLogOutcomeBar outcome={eventToOutcome()} />
            {/* The number is the row's place in the list on show; the handle is
                the row's own id, so filtering renumbers without ever changing
                which swap is opened. */}
            <EventLogNumber
              n={i + 1}
              isOpenInHistory={historyView.viewedEventId === swap.id}
              onShowHistory={() => historyView.show(swap.id, i + 1)}
            />
            <td className={gameEventLog.main}>
              <span className={styles.move}>
                <span className={styles.letter}>{a.letter}</span>
                <span className={styles.coord}>({coord(Number(a.id))})</span>
                <span className={styles.arrow}>↔</span>
                <span className={styles.letter}>{b.letter}</span>
                <span className={styles.coord}>({coord(Number(b.id))})</span>
              </span>
            </td>
            <EventLogActor actor={swap.by} />
          </tr>
        )
      })}
    </EventLog>
  )
}
