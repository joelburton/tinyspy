import { cls } from '../../common/lib/util/cls'
import { HEX_W, HEX_H, HEX_VERTS, HEX_SHRINK } from '../lib/honeycomb'
import styles from './Letters.module.css'

type Props = {
  letter: string
  isCenter?: boolean
  /** Top-left of this hex's box, in the flower's coordinate units. */
  pos: { left: number; top: number }
  onClick: () => void
  /** A bumping counter that flashes this tile on click (0 = never clicked). Used
   *  as the flash overlay's `key`, so re-clicking the SAME tile replays it. */
  flashNonce: number
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
export function Letter({ letter, isCenter, pos, onClick, flashNonce }: Props) {
  const up = letter.toUpperCase()
  const points = HEX_VERTS.map(([fx, fy]) => {
    const sx = 0.5 + (fx - 0.5) * HEX_SHRINK
    const sy = 0.5 + (fy - 0.5) * HEX_SHRINK
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
      {/* Click-flash overlay — keyed by the nonce so each click replays it; sits
          above the shape but below the text (letter stays readable). */}
      {flashNonce > 0 && (
        <polygon key={flashNonce} className={styles.hexFlash} points={points} />
      )}
      <text className={styles.hexText} x={cx} y={cy}>
        {up}
      </text>
    </g>
  )
}
