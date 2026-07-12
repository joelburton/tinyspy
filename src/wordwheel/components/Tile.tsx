import { cls } from '../../common/lib/util/cls'
import styles from './Wheel.module.css'

type Props = {
  letter: string
  isCenter?: boolean
  /** This tile's centre + radius, in the wheel's coordinate units. */
  pos: { cx: number; cy: number; r: number }
  onClick: () => void
  /** A bumping counter that flashes this tile on click (0 = never clicked). Used
   *  as the flash overlay's `key`, so re-clicking the SAME tile replays it. */
  flashNonce: number
  /** True once this tile's letter is already in the typed word. Word wheel uses
   *  each tile ONCE per word, so a used tile is inert — dimmed, not focusable,
   *  and clicks/keys do nothing. */
  disabled?: boolean
}

/**
 * One tile in the wheel — an SVG `<circle>` (a REAL fill + stroke border) plus a
 * centred `<text>`. Drawn inside the parent `<Wheel>` svg, so it shares the wheel's
 * coordinate space. The centre tile is larger (its radius comes from the geometry)
 * and red (via the `.center` class); the eight outer tiles are the warm tile colour.
 *
 * The group is the interactive element (`role="button"` + `tabIndex` + Enter/Space
 * keydown) since you can't nest a real `<button>` in SVG; the circle's fill is the
 * hit area, so clicks only land on the tile shape (not its bounding-box corners).
 * `onMouseDown` is intercepted so clicking a letter doesn't steal focus from the
 * typed-word input (the next keystroke must still reach the input). SVG `<text>`
 * ignores `text-transform`, so we uppercase here.
 */
export function Tile({ letter, isCenter, pos, onClick, flashNonce, disabled }: Props) {
  const up = letter.toUpperCase()
  return (
    <g
      className={cls(styles.tile, isCenter && styles.center, disabled && styles.disabled)}
      role="button"
      tabIndex={disabled ? -1 : 0}
      aria-disabled={disabled || undefined}
      aria-label={isCenter ? `${up} (center letter)` : up}
      onClick={disabled ? undefined : onClick}
      onKeyDown={(e) => {
        if (!disabled && (e.key === 'Enter' || e.key === ' ')) {
          e.preventDefault()
          onClick()
        }
      }}
      onMouseDown={(e) => e.preventDefault()}
    >
      <circle className={styles.tileShape} cx={pos.cx} cy={pos.cy} r={pos.r} />
      {/* Click-flash overlay — keyed by the nonce so each click replays it; sits
          above the shape but below the text (letter stays readable). */}
      {flashNonce > 0 && (
        <circle key={flashNonce} className={styles.tileFlash} cx={pos.cx} cy={pos.cy} r={pos.r} />
      )}
      <text className={styles.tileText} x={pos.cx} y={pos.cy}>
        {up}
      </text>
    </g>
  )
}
