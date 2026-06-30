import { IconStrikeUsed, IconStrikeOpen } from './icons'
import styles from './StrikeMarks.module.css'

type Props = {
  /** How many of the budget are used — 0..total. */
  used: number
  /** Total slots (the limit). */
  total: number
}

/**
 * A bounded "N of M used" meter, drawn as a row of square marks that fill
 * left-to-right: the first `used` are a **red square-X** (used / struck), the
 * rest a **dashed square** (an open slot). Reads the same direction as a "N/M"
 * text count.
 *
 * Deliberately **squares, not dots** — circles are reserved for the
 * player-identity disc (docs/ui.md → Player identity = a colored disc). First
 * used by connections for its mistakes ("Mistakes (lose at 4)"); reusable for any
 * limited-attempts / strikes / penalties counter. The marks size in `em` so they
 * read at the surrounding text scale. Stateless, no interaction.
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
