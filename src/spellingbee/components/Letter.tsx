import { cls } from '../../common/lib/cls'
import styles from './Letters.module.css'

/** Flat-top hex, 100×87 in the flower's coordinate units. Its 6 vertices as
 *  fractions of the box (vertical sides at 25%/75%) — the SVG equivalent of the
 *  old `clip-path: polygon(25% 0, 75% 0, 100% 50, 75% 100, 25% 100, 0% 50)`. */
const HEX_W = 100
const HEX_H = 87
const VERTS: ReadonlyArray<readonly [number, number]> = [
  [0.25, 0],
  [0.75, 0],
  [1, 0.5],
  [0.75, 1],
  [0.25, 1],
  [0, 0.5],
]
/** Draw each hex slightly smaller than its cell (inset toward the cell centre), so
 *  the gaps between adjacent hexes are a touch bigger. Positions/centres unchanged. */
const SHRINK = 0.97

type Props = {
  letter: string
  isCenter?: boolean
  /** Top-left of this hex's box, in the flower's coordinate units. */
  pos: { left: number; top: number }
  onClick: () => void
}

/**
 * One hex in the honeycomb — an SVG `<polygon>` (a REAL fill + stroke border,
 * which the old `clip-path` div couldn't give us) plus a centered `<text>`. Drawn
 * inside the parent `<Letters>` svg, so it shares the flower's coordinate space.
 *
 * The group is the interactive element (`role="button"` + `tabIndex` + Enter/Space
 * keydown) since you can't nest a real `<button>` in SVG; the polygon's fill is the
 * hit area, so clicks only land on the hex shape (not its bounding-box corners).
 * `onMouseDown` is intercepted so clicking a letter doesn't steal focus from the
 * typed-word input (same reason as the old button — the next keystroke must still
 * reach the input). SVG `<text>` ignores `text-transform`, so we uppercase here.
 */
export function Letter({ letter, isCenter, pos, onClick }: Props) {
  const up = letter.toUpperCase()
  const points = VERTS.map(([fx, fy]) => {
    const sx = 0.5 + (fx - 0.5) * SHRINK
    const sy = 0.5 + (fy - 0.5) * SHRINK
    return `${pos.left + sx * HEX_W},${pos.top + sy * HEX_H}`
  }).join(' ')
  const cx = pos.left + HEX_W / 2
  const cy = pos.top + HEX_H / 2
  return (
    <g
      className={cls(styles.hex, isCenter && styles.center)}
      role="button"
      tabIndex={0}
      aria-label={isCenter ? `${up} (center letter)` : up}
      onClick={onClick}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault()
          onClick()
        }
      }}
      onMouseDown={(e) => e.preventDefault()}
    >
      <polygon className={styles.hexShape} points={points} />
      <text className={styles.hexText} x={cx} y={cy}>
        {up}
      </text>
    </g>
  )
}
