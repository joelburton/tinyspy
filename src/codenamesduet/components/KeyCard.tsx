// cs-blessed-codenamesduet

import { cls } from '@/common/utils/cls'
import type { GKey } from '../types'
import styles from './KeyCard.module.css'

/** Each key's cell class — total over the three, so a fourth fails to
 *  compile until it has been given a color. */
const CELL: Record<GKey, string> = {
  G: styles.agent,
  N: styles.neutral,
  A: styles.assassin,
}

/**
 * A player's key card as the game dealt it: the board's 5×5, no words, each
 * cell in its key color (agent, bystander, assassin). Static — the board
 * already shows what has been found.
 *
 * The info column shows it inside an `<InfoDisclosure>`; nothing here knows
 * that.
 */
export function KeyCard({
  keys,
}: {
  // The player's 25 keys, in the puzzle's tile order.
  keys: ReadonlyArray<GKey>
}) {
  return (
    <div className={styles.card} data-key-card>
      {keys.map((key, position) => (
        <span
          key={position}
          className={cls(styles.cell, CELL[key])}
          data-key={key}
        />
      ))}
    </div>
  )
}
