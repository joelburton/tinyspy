// cs-unmet

import type { CSSProperties } from 'react'
import { cls } from '@/common/utils/cls'
import type { Outcome } from '@/common/outcomes/outcomes'
import { VERDICT_TONE } from '@/common/game-page/verdictTone'
import shared from '@/common/game-page/playArea.module.css'
import { RING_W } from '../lib/wheel'
import styles from './Wheel.module.css'

type Props = {
  letter: string
  isCenter?: boolean
  /** This tile's center + radius, in the wheel's coordinate units. */
  pos: { cx: number; cy: number; r: number }
  onClick: () => void
  /** True once this tile's letter is already in the typed word. Word wheel uses
   *  each tile ONCE per word, so a used tile is inert — it wears the selected
   *  border, is not clickable, and takes no hover or press. */
  disabled?: boolean
  /** A refused word used this tile: its face wears that answer's fill, edge and
   *  white ink for as long as the answer is up, and shakes once as it arrives
   *  (the Wheel remounts it per refusal, which is what replays the shake). */
  answer?: Outcome
}

/**
 * One tile in the wheel: a mustard SEAT, absolutely placed on the wheel's square
 * by its own center, and the FACE that sits in it. Only the face is the piece —
 * it carries the letter, the shadow, the lift and the press; the seats are
 * tangent by construction and merge into the flower the board reads as, so they
 * stay put. The center tile is larger (its radius comes from the geometry) and
 * purple (via the `.center` class); the eight outer faces are the warm tile color.
 *
 * Boxes rather than SVG circles, so the depth can be the shared `--tile-shadow`
 * pair rather than a `drop-shadow` filter with every length divided by the
 * board's scale — the same move letterboxed's letters made, and for one reason
 * more: a box can be raised over its neighbors when it lifts. The seats TOUCH, so
 * without a stacking order a hovered face would rise behind the ones drawn after
 * it, and SVG has no z-index.
 *
 * **POINTER-ONLY**: no `tabIndex`, no `role`, no Enter/Space keydown — a tile
 * isn't keyboard-reachable and can't be, since the page's tab ring is empty. See
 * spellingbee's `Letter` for the same note at length.
 *
 * `data-tile` / `data-center` / `data-disabled` are the test hooks that replaced
 * `role="button"` + `aria-label` + `aria-disabled` — stable handles without the
 * behavior an ARIA role implies.
 *
 * `onMouseDown` is still intercepted, now only to stop a click selecting the
 * letter text.
 */
export function Tile({ letter, isCenter, pos, onClick, disabled, answer }: Props) {
  const up = letter.toUpperCase()
  return (
    <div
      className={cls(
        styles.tile,
        isCenter && styles.center,
        disabled && styles.used,
        // The tone class sets only the verdict tokens (`VERDICT_TONE`);
        // `.answered` maps them onto the face.
        answer && styles.answered,
        answer && VERDICT_TONE[answer],
      )}
      // The tile's own place on the wheel, in the geometry's units scaled by
      // `--u` — the same numbers the PDF draws by. `--d` is the outer diameter
      // (the circle plus its ring), and the stylesheet's negative margins pull
      // the box back onto the center point `left`/`top` name, leaving
      // `transform` free for the lift and the press.
      style={
        {
          left: `calc(${pos.cx} * var(--u))`,
          top: `calc(${pos.cy} * var(--u))`,
          '--d': `calc(${2 * pos.r + RING_W} * var(--u))`,
        } as CSSProperties
      }
      data-tile={up}
      data-center={isCenter || undefined}
      data-disabled={disabled || undefined}
      onClick={disabled ? undefined : onClick}
      onMouseDown={(e) => e.preventDefault()}
    >
      {/* The shared head-shake, on the FACE — the piece; the seats are the
          flower and stay put. Every answer a tile can wear is a refusal. */}
      <div className={cls(styles.face, answer && shared.verdictShake)}>{up}</div>
    </div>
  )
}
