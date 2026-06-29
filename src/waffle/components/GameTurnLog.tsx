import { ActorTag } from '../../common/components/ActorTag'
import { TurnLog, TurnLogItem } from '../../common/components/TurnLog'
import turnLog from '../../common/components/TurnLog.module.css'
import type { Member } from '../../common/lib/games'
import { coord } from '../lib/waffle'
import type { WaffleSwap } from '../hooks/useGame'
import styles from './GameTurnLog.module.css'

type Props = {
  swaps: WaffleSwap[]
  players: Member[]
}

/**
 * waffle's turn log — the shared swap history rendered with the common
 * `<TurnLog>` table (same chrome psychicnum / connections / codenamesduet use).
 * One `<TurnLogItem>` per swap. A swap has no win/lose verdict, so every row's
 * outcome bar is `neutral` (grey, like psychicnum's hint rows).
 *
 * One row, four columns (the table aligns them down the log): the outcome bar
 * (prepended by `<TurnLogItem>`), the turn number ("#N"), the move
 * ("A (A1) ↔ B (C2)" — swapped letters leading, coordinates receding), and the
 * swapper's `<ActorTag>` right-aligned. Coop only (compete writes no swaps, and a
 * swap sequence would leak an opponent's hidden board); PlayArea gates the render.
 * Stateless + presentational — the shared `<TurnLog>` snaps to the latest row.
 */
export function GameTurnLog({ swaps, players }: Props) {
  const playerFor = (userId: string) =>
    players.find((m) => m.user_id === userId)

  return (
    <TurnLog
      heading="Swaps"
      empty={swaps.length === 0}
      emptyText="No swaps yet."
      scrollKey={swaps.length}
    >
      {swaps.map((s) => {
        const swapper = playerFor(s.user_id)
        return (
          <TurnLogItem key={s.swap_index} outcome="neutral">
            {/* After the outcome-bar cell: #N · the move · the swapper. As real
                `<td>`s (not stacked divs) so they align as columns down the log. */}
            <td className={turnLog.meta}>#{s.swap_index}</td>
            <td>
              <span className={styles.move}>
                <span className={styles.letter}>{s.letter_a.toUpperCase()}</span>
                <span className={styles.coord}>({coord(s.pos_a)})</span>
                <span className={styles.arrow}>↔</span>
                <span className={styles.letter}>{s.letter_b.toUpperCase()}</span>
                <span className={styles.coord}>({coord(s.pos_b)})</span>
              </span>
            </td>
            <td className={turnLog.who}>
              <ActorTag actor={swapper} fallback="someone" />
            </td>
          </TurnLogItem>
        )
      })}
    </TurnLog>
  )
}
