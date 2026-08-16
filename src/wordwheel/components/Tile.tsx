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
 * The group carries the click (you can't nest a real `<button>` in SVG); the
 * circle's fill is the hit area, so clicks only land on the tile shape, not its
 * bounding-box corners. **POINTER-ONLY**: no `tabIndex`, no `role`, no
 * Enter/Space keydown — a tile isn't keyboard-reachable and can't be, since
 * `useCaptureKeys` swallows Tab while play is live (the caret owns the
 * keyboard). See spellingbee's `Letter` for the same note at length.
 *
 * `data-tile` / `data-center` / `data-disabled` are the test hooks that replaced
 * `role="button"` + `aria-label` + `aria-disabled` — stable handles without the
 * behaviour an ARIA role implies.
 *
 * `onMouseDown` is still intercepted, now only to stop a click selecting the
 * letter text. SVG `<text>` ignores `text-transform`, so we uppercase here.
 */
export function Tile({ letter, isCenter, pos, onClick, flashNonce, disabled }: Props) {
  const up = letter.toUpperCase()
  return (
    <g
      className={cls(styles.tile, isCenter && styles.center, disabled && styles.disabled)}
      data-tile={up}
      data-center={isCenter || undefined}
      data-disabled={disabled || undefined}
      onClick={disabled ? undefined : onClick}
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
