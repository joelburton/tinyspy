// cs-met-codenamesduet

import { cls } from '@/common/utils/cls'
import type { KeyLabel } from '../lib/labels'
import styles from './KeyCard.module.css'

/** Each label's cell class — total over the three, so a fourth fails to
 *  compile until it has been given a color. */
const CELL: Record<KeyLabel, string> = {
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
  labels,
}: {
  // The 25 labels in board order (`words.position`), from the caller's own key.
  labels: ReadonlyArray<KeyLabel>
}) {
  return (
    <div className={styles.card} data-key-card>
      {labels.map((label, position) => (
        <span key={position} className={cls(styles.cell, CELL[label])} data-key-label={label} />
      ))}
    </div>
  )
}
