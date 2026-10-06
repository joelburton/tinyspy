// cs-unmet

import { COLORS } from '../lib/tiles'
import { STRIPE } from '../lib/shapes'
import styles from './TileDefs.module.css'

/**
 * The three stripe patterns, rendered ONCE per surface that draws tiles.
 *
 * SVG pattern ids are document-global, so these cannot live inside `<Tile>` —
 * eighteen tiles would each define `#setgame-stripe-red` and the browser would
 * resolve every reference to whichever won. One hidden `<svg>` at the board
 * level, referenced by every tile, is the standard shape for this.
 *
 * The stripes are HORIZONTAL, which is not a taste call: the symbols are tall
 * and narrow, so vertical stripes gave a diamond two or three lines and it read
 * as "solid with a scratch on it". Across the long axis there is room for about
 * a dozen.
 */
export function TileDefs() {
  return (
    <svg className={styles.defs} aria-hidden="true">
      <defs>
        {COLORS.map((color) => (
          <pattern
            key={color}
            id={`setgame-stripe-${color}`}
            patternUnits="userSpaceOnUse"
            width={STRIPE.pitch}
            height={STRIPE.pitch}
          >
            <path
              d={`M 0 2 H ${STRIPE.pitch}`}
              stroke={`var(--setgame-${color})`}
              strokeWidth={STRIPE.thickness}
            />
          </pattern>
        ))}
      </defs>
    </svg>
  )
}
