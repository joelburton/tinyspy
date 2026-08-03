import { TurnLogActor } from '../../common/components/game/lists/TurnLogActor'
import { TurnLog, TurnLogBar, TurnLogNumber } from '../../common/components/game/lists/TurnLog'
import turnLog from '../../common/components/game/lists/TurnLog.module.css'
import { useTurnLogPlayerPicker } from '../../common/hooks/game/useTurnLogPlayerPicker'
import type { Member } from '../../common/lib/games'
import { coord } from '../lib/waffle'
import type { SwapRow } from '../hooks/useGame'
import styles from './GameTurnLog.module.css'

type Props = {
  /** Every swap the viewer can see. Coop: the whole shared game. Compete: your
   *  own during play, and (once terminal, when RLS opens) everyone's. */
  swaps: SwapRow[]
  players: Member[]
  selfId: string
  mode: 'coop' | 'compete'
  /** Distinguishes an opponent's RLS-hidden log from a genuinely empty one. */
  isTerminal: boolean
  /** The swap currently open in the board viewer (by log position), or null. */
  viewingIndex: number | null
  /** Open a swap in the board viewer (click a row). */
  onSelectTurn: (index: number) => void
}

/**
 * waffle's turn log — the shared swap history rendered with the common
 * `<TurnLog>` table (same chrome psychicnum / connections / codenamesduet use).
 * waffle renders its OWN `<tr>` rows (the shared layer no longer owns row shape;
 * `<TurnLogItem>` is retired — docs/playarea.md → Turn log), composing the
 * shared `<TurnLogBar>` + content classes. A swap has no win/lose verdict, so
 * every row's outcome bar is `neutral` (grey, like psychicnum's hint rows).
 *
 * One `<tr>`, four real `<td>` columns (so they align down the log — never stacked
 * divs, which throw away the column alignment the table exists for): the outcome
 * bar, the turn number ("#N", `.meta`), the move ("A (A1) ↔ B (C2)" — swapped
 * letters leading, coordinates receding — in `.main` so it absorbs the row's
 * slack), and the swapper's `<ActorTag>` right-aligned (`.who`). `.turnLogDivider`
 * draws the between-turns line.
 *
 * **Both modes** since 2026-08-02 (compete used to write no swaps at all). Whose
 * swaps show is picked by the shared `useTurnLogPlayerPicker` — solo is your
 * handle, coop is "Team" plus each player, compete is "All" plus each player. In compete an opponent's rows are
 * RLS-hidden during play and open at terminal, which is exactly what the
 * picker's empty text says; the gate is load-bearing, since replaying someone's
 * swaps from the shared scramble rebuilds their board.
 *
 * Stateless + presentational — the shared `<TurnLog>` snaps to the latest row.
 */
export function GameTurnLog({
  swaps,
  players,
  selfId,
  mode,
  isTerminal,
  viewingIndex,
  onSelectTurn,
}: Props) {
  const who = useTurnLogPlayerPicker<SwapRow>({
    players,
    selfId,
    mode,
    isTerminal,
    label: 'Whose swaps to show',
    emptyLabel: 'No swaps yet.',
  })
  const shown = who.filter(swaps)

  const playerFor = (userId: string) =>
    players.find((m) => m.user_id === userId)

  return (
    <TurnLog
      heading="Swaps"
      headerAction={who.picker}
      empty={shown.length === 0}
      emptyText={who.emptyText}
      scrollKey={shown.length}
    >
      {shown.map((s, i) => {
        const swapper = playerFor(s.user_id)
        // The "#N" handle replays that swap on the board viewer. Identified by
        // POSITION in the log (mirrors stackdown's GameTurnLog), shown as seq.
        return (
          <tr key={`${s.user_id}-${s.seq}`} className={turnLog.turnLogDivider}>
            <TurnLogBar outcome="neutral" />
            {/* The "#N" handle replays that swap on the board — live only when
                the rows shown ARE the board's (coop's shared game, or my own).
                An opponent's log, or the All view, can't drive my board. */}
            {who.boardIsShown ? (
              <TurnLogNumber
                n={s.seq}
                viewing={viewingIndex === i}
                onSelect={() => onSelectTurn(i)}
              />
            ) : (
              <td className={turnLog.meta}>#{s.seq}</td>
            )}
            <td className={turnLog.main}>
              <span className={styles.move}>
                <span className={styles.letter}>{s.letter_a.toUpperCase()}</span>
                <span className={styles.coord}>({coord(s.pos_a)})</span>
                <span className={styles.arrow}>↔</span>
                <span className={styles.letter}>{s.letter_b.toUpperCase()}</span>
                <span className={styles.coord}>({coord(s.pos_b)})</span>
              </span>
            </td>
            <TurnLogActor actor={swapper} fallback="someone" />
          </tr>
        )
      })}
    </TurnLog>
  )
}
