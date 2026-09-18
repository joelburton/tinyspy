// cs-fixed-outcome-fix

import { EventLog, EventLogActor, EventLogOutcomeBar, EventLogNumber } from '@/common/event-log/EventLog'
import gameEventLog from '@/common/event-log/gameEventLog.module.css'
import { useEventLogPlayerPicker } from '@/common/event-log/useEventLogPlayerPicker'
import type { Member } from '@/common/members/member'
import { coord } from '../lib/waffle'
import type { EventRow } from '../hooks/useGame'
import styles from './GameEventLog.module.css'

type Props = {
  /** Every swap the viewer can see. Coop: the whole shared game. Compete: your
   *  own during play, and (once terminal, when RLS opens) everyone's. */
  swaps: EventRow[]
  players: Member[]
  selfId: string
  mode: 'coop' | 'compete'
  /** Distinguishes an opponent's RLS-hidden log from a genuinely empty one. */
  isTerminal: boolean
  /** The swap currently open in the board viewer (by log position), or null. */
  historyId: number | null
  /** Open a swap in the board viewer (click a row). */
  onShowHistory: (index: number) => void
}

/**
 * waffle's event log — the shared swap history rendered with the common
 * `<EventLog>` table (same chrome psychicnum / connections / codenamesduet use).
 * waffle renders its OWN `<tr>` rows (the shared layer no longer owns row shape;
 * `<EventLogItem>` is retired — docs/playarea.md → Event log), composing the
 * shared `<EventLogOutcomeBar>` + content classes. A swap has no win/lose verdict,
 * so every row's outcome bar is `neutral` — the word for a turn that counted and
 * that nothing adjudicates.
 *
 * **That is the whole of waffle's outcome decision**, which is why there is no
 * `lib/answer.ts` here as there is in most games: the game has one move kind,
 * `submit_swap` deliberately carries no outcome and no message (the colors reach
 * everyone together over realtime instead), and no pill reports a swap at all.
 * One move, one word, one reader (docs/outcomes.md → One event, one outcome).
 *
 * One `<tr>`, four real `<td>` columns (so they align down the log — never stacked
 * divs, which throw away the column alignment the table exists for): the outcome
 * bar, the turn number ("#N", `<EventLogNumber>`), the move ("A (A1) ↔ B (C2)" —
 * swapped letters leading, coordinates receding — in `.main` so it absorbs the
 * row's slack), and the swapper right-aligned in `<EventLogActor>`. `.divider`
 * draws the between-turns line.
 *
 * **Both modes** since 2026-08-02 (compete used to write no swaps at all). Whose
 * swaps show is picked by the shared `useEventLogPlayerPicker` — solo is your
 * handle, coop is "Team" plus each player, compete is "All" plus each player. In compete an opponent's rows are
 * RLS-hidden during play and open at terminal, which is exactly what the
 * picker's empty text says; the gate is load-bearing, since replaying someone's
 * swaps from the shared scramble rebuilds their board.
 *
 * Stateless + presentational — the shared `<EventLog>` snaps to the latest row.
 */
export function GameEventLog({
  swaps,
  players,
  selfId,
  mode,
  isTerminal,
  historyId,
  onShowHistory,
}: Props) {
  const eventLogPicker = useEventLogPlayerPicker<EventRow>({
    players,
    selfId,
    mode,
    isTerminal,
    label: 'Whose swaps to show',
    emptyLabel: 'No swaps yet.',
  })
  const shown = eventLogPicker.filter(swaps)

  const playerFor = (userId: string) =>
    players.find((m) => m.user_id === userId)

  return (
    <EventLog heading="Swaps" picker={eventLogPicker} shown={shown}>
      {shown.map((s, i) => {
        const swapper = playerFor(s.user_id)
        // The "#N" handle replays that swap on the board viewer, and the
        // number IS that position — the row's place in the list being shown,
        // which is what the handle addresses.
        return (
          <tr key={s.id} className={gameEventLog.divider}>
            <EventLogOutcomeBar outcome="neutral" />
            {/* The "#N" handle replays that swap on the board — live only when
                the rows shown ARE the board's (coop's shared game, or my own).
                An opponent's log, or the All view, can't drive my board. */}
            <EventLogNumber
              n={i + 1}
              isOpenInHistory={historyId === i}
              onShowHistory={eventLogPicker.boardIsShown ? () => onShowHistory(i) : undefined}
            />
            <td className={gameEventLog.main}>
              <span className={styles.move}>
                <span className={styles.letter}>{s.letter_a.toUpperCase()}</span>
                <span className={styles.coord}>({coord(s.pos_a)})</span>
                <span className={styles.arrow}>↔</span>
                <span className={styles.letter}>{s.letter_b.toUpperCase()}</span>
                <span className={styles.coord}>({coord(s.pos_b)})</span>
              </span>
            </td>
            <EventLogActor actor={swapper} fallback="someone" />
          </tr>
        )
      })}
    </EventLog>
  )
}
