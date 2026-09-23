// cs-met-spellingbee

import { cls } from '@/common/utils/cls'
import type { Outcome } from '@/common/outcomes/outcomes'
import { VERDICT_TONE } from '@/common/game-page/verdictTone'
import { HEX_W, HEX_H, HEX_VERTS, HEX_SHRINK } from '../lib/honeycomb'
import styles from './Letters.module.css'

type Props = {
  letter: string
  isCenter?: boolean
  /** Top-left of this hex's box, in the flower's coordinate units. */
  pos: { left: number; top: number }
  onClick: () => void
  /** This letter is in the word being typed — the hex wears the selected edge. */
  used?: boolean
  /** A refused word used this letter: the hex wears that answer's fill + white
   *  ink for as long as the answer is up. */
  answer?: Outcome
}

/**
 * One hex in the honeycomb — an SVG `<polygon>` (a REAL fill + stroke border,
 * which the old `clip-path` div couldn't give us) plus a centered `<text>`. Drawn
 * inside the parent `<Letters>` svg, so it shares the flower's coordinate space.
 *
 * The group carries the click (you can't nest a real `<button>` in SVG); the
 * polygon's fill is the hit area, so clicks only land on the hex shape, not its
 * bounding-box corners. **POINTER-ONLY**: no `tabIndex`, no `role`, no
 * Enter/Space keydown. A hex isn't keyboard-reachable and can't be — the page's
 * tab ring is empty, so the whole button costume was unreachable scaffolding,
 * and the one path that did open it left the hex focused with a stuck ring and
 * fired `onClick` into an entry the game no longer accepts. The letters are
 * typed, or clicked; there is no third way.
 *
 * `data-hex` / `data-center` are the test hooks that replaced `role="button"` +
 * `aria-label` — a stable handle without the behavior an ARIA role implies
 * (the same reason boggle's tiles carry `data-boggle-tile`).
 *
 * `onMouseDown` is still intercepted, now only to stop a click selecting the
 * letter text — nothing here can take focus any more.
 * SVG `<text>` ignores `text-transform`, so we uppercase here.
 */
export function Letter({ letter, isCenter, pos, onClick, used, answer }: Props) {
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
      className={cls(
        styles.hex,
        isCenter && styles.center,
        used && styles.used,
        // The tone class sets nothing but the two custom properties the shape
        // and the text read below, which is why a hex can take one without
        // being a `.tileFace`.
        answer && styles.answered,
        answer && VERDICT_TONE[answer],
      )}
      data-hex={up}
      data-center={isCenter || undefined}
      onClick={onClick}
      onMouseDown={(e) => e.preventDefault()}
    >
      <polygon className={styles.hexShape} points={points} />
      <text className={styles.hexText} x={cx} y={cy}>
        {up}
      </text>
    </g>
  )
}
