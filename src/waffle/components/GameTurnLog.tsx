import { TurnLogActor } from '../../common/components/game/lists/TurnLogActor'
import { TurnLog, TurnLogBar, TurnLogNumber } from '../../common/components/game/lists/TurnLog'
import turnLog from '../../common/components/game/lists/TurnLog.module.css'
import type { Member } from '../../common/lib/games'
import { coord } from '../lib/waffle'
import type { WaffleSwap } from '../hooks/useGame'
import styles from './GameTurnLog.module.css'

type Props = {
  swaps: WaffleSwap[]
  players: Member[]
  /** The swap currently open in the board viewer (by log position), or null. */
  viewingIndex: number | null
  /** Open a swap in the board viewer (click a row). */
  onSelectTurn: (index: number) => void
}

/**
 * waffle's turn log — the shared swap history rendered with the common
 * `<TurnLog>` table (same chrome psychicnum / connections / codenamesduet use).
 * waffle renders its OWN `<tr>` rows (the shared layer no longer owns row shape;
 * `<TurnLogItem>` is retired — docs/design-decisions.md → Turn log), composing the
 * shared `<TurnLogBar>` + content classes. A swap has no win/lose verdict, so
 * every row's outcome bar is `neutral` (grey, like psychicnum's hint rows).
 *
 * One `<tr>`, four real `<td>` columns (so they align down the log — never stacked
 * divs, which throw away the column alignment the table exists for): the outcome
 * bar, the turn number ("#N", `.meta`), the move ("A (A1) ↔ B (C2)" — swapped
 * letters leading, coordinates receding — in `.main` so it absorbs the row's
 * slack), and the swapper's `<ActorTag>` right-aligned (`.who`). `.turnLogDivider`
 * draws the between-turns line. Coop only (compete writes no swaps, and a swap
 * sequence would leak an opponent's hidden board); PlayArea gates the render.
 * Stateless + presentational — the shared `<TurnLog>` snaps to the latest row.
 */
export function GameTurnLog({ swaps, players, viewingIndex, onSelectTurn }: Props) {
  const playerFor = (userId: string) =>
    players.find((m) => m.user_id === userId)

  return (
    <TurnLog
      heading="Swaps"
      empty={swaps.length === 0}
      emptyText="No swaps yet."
      scrollKey={swaps.length}
    >
      {swaps.map((s, i) => {
        const swapper = playerFor(s.user_id)
        // The "#N" handle replays that swap on the board viewer. Identified by
        // POSITION in the log (mirrors stackdown's GameTurnLog), shown as swap_index.
        return (
          <tr key={s.swap_index} className={turnLog.turnLogDivider}>
            <TurnLogBar outcome="neutral" />
            <TurnLogNumber
              n={s.swap_index}
              viewing={viewingIndex === i}
              onSelect={() => onSelectTurn(i)}
            />
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
