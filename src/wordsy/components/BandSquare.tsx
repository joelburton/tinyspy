// cs-unmet

import { cls } from '@/common/utils/cls'
import type { GBand } from '../types'
import styles from './BandSquare.module.css'

/**
 * One band of the solo card, as a square in its color with its number: green
 * 1, amber 2, red 3. The card draws three (`SoloCard`), the dark border on the
 * one the timer sits on; a scoresheet row draws the one its word was scored on.
 */
export function BandSquare({ band, isCurrent = false }: { band: GBand; isCurrent?: boolean }) {
  return (
    <span
      data-testid={`band-${band}`}
      className={cls(styles.band, styles[`band_${band}`], isCurrent && styles.current)}
    >
      {band}
    </span>
  )
}
