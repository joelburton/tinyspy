// cs-blessed-connections

import { IconStrikeUsed, IconStrikeOpen } from '@/common/icons/icons'
import styles from './StrikeMarks.module.css'

type Props = {
  // How many of the budget are used — 0..total.
  used: number
  // Total slots (the limit).
  total: number
}

/**
 * A bounded "N of M used" meter: a row of square marks filling left to right,
 * `used` of them a red square-X and the rest a dashed open square. The mistakes
 * meter on the commit row ("Mistakes (lose at 4)").
 *
 * Squares, not dots — a circle is the player-identity disc (docs/ui.md). The
 * marks size in `em`, so they read at the surrounding text scale.
 */
export function StrikeMarks({ used, total }: Props) {
  return (
    <span className={styles.marks} aria-label={`${used} of ${total} used`}>
      {Array.from({ length: total }, (_, i) =>
        i < used ? (
          <IconStrikeUsed key={i} className={styles.used} aria-hidden />
        ) : (
          <IconStrikeOpen key={i} className={styles.open} aria-hidden />
        ),
      )}
    </span>
  )
}
