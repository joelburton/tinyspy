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
 * outcome bar is `neutral` (like psychicnum's hint rows).
 *
 * Two-line row body: "Swap #N" with the swapper's `<ActorTag>` on the right,
 * then the move itself — "A (A1) ↔ B (C2)", the swapped letters leading, the
 * coordinates receding. Coop only (compete writes no swaps, and a swap sequence
 * would leak an opponent's hidden board); PlayArea gates the render. Stateless +
 * presentational — the shared `<TurnLog>` snaps to the latest row.
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
            {/* One content cell beside the outcome bar: "Swap #N" + swapper on
                top, the move below. */}
            <td>
              <div className={styles.swapRow}>
                <span className={turnLog.meta}>Swap #{s.swap_index}</span>
                <ActorTag actor={swapper} fallback="someone" />
              </div>
              <div className={styles.move}>
                <span className={styles.letter}>{s.letter_a.toUpperCase()}</span>
                <span className={styles.coord}>({coord(s.pos_a)})</span>
                <span className={styles.arrow}>↔</span>
                <span className={styles.letter}>{s.letter_b.toUpperCase()}</span>
                <span className={styles.coord}>({coord(s.pos_b)})</span>
              </div>
            </td>
          </TurnLogItem>
        )
      })}
    </TurnLog>
  )
}
