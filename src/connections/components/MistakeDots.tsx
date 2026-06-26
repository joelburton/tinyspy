import styles from './MistakeDots.module.css'

type Props = {
  /** How many mistakes have been made — 0..total. */
  used: number
  /** Total mistakes allowed before loss. Defaults to 4 — the NYT
   *  Connections value + the connections DB constraint
   *  (`mistake_count between 0 and 4`). Exposed in case a future
   *  variant uses a different budget. */
  total?: number
}

/**
 * NYT-style mistakes indicator: a row of small dots, one per
 * remaining mistake. The first `total - used` dots are filled;
 * the rest are outlined-empty. Matches the NYT Connections look —
 * "Mistakes remaining ● ● ● ○" — and replaces the older
 * "Mistakes left: 3" text-only treatment.
 *
 * Stateless, no interaction. The dots are sized to read at the
 * existing status-line scale; the outlined-empty state keeps the
 * row's width stable as mistakes are made so the line doesn't
 * shift sideways.
 */
export function MistakeDots({ used, total = 4 }: Props) {
  const remaining = Math.max(0, total - used)
  return (
    <span className={styles.dots} aria-label={`${remaining} mistakes remaining`}>
      {Array.from({ length: total }, (_, i) => (
        <span
          key={i}
          className={i < remaining ? styles.dotFilled : styles.dotEmpty}
          aria-hidden="true"
        />
      ))}
    </span>
  )
}
