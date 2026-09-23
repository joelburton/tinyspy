// cs-met-spellingbee

import { cls } from '@/common/utils/cls'
import type { Outcome } from '@/common/outcomes/outcomes'
import { VERDICT_TONE } from '@/common/game-page/verdictTone'
import shared from '@/common/game-page/playArea.module.css'
import { HEX_W, HEX_H, HEX_VERTS, HEX_SHRINK } from '../lib/honeycomb'
import styles from './Letter.module.css'

type Props = {
  letter: string
  isCenter?: boolean
  // Top-left of this hex's box, in the flower's coordinate units.
  pos: { left: number; top: number }
  // Absent when the board is read-only: the hex takes no click and wears no
  // hover or press.
  onClick?: () => void
  // This letter is in the word being typed — the hex wears the selected edge.
  used?: boolean
  // A refused word used this letter: the hex wears that answer's fill, edge and
  // white ink for as long as the answer is up, and shakes once as it arrives
  // (the parent remounts it per refusal, which is what replays the shake).
  answer?: Outcome
}

/**
 * One hex in the honeycomb — an SVG `<polygon>` plus a centered `<text>`, drawn
 * inside the parent `<Letters>` svg so it shares the flower's coordinate space.
 *
 * The group carries the click, since a real `<button>` cannot nest in SVG, and
 * the polygon's fill is the hit area, so a click lands on the hex shape and
 * not its bounding-box corners. **POINTER-ONLY**: no `tabIndex`, no `role`, no
 * Enter/Space keydown — the page's tab ring is empty, so a hex is not
 * keyboard-reachable; the letters are typed, or clicked. `data-hex` /
 * `data-center` are the test handles.
 *
 * `onMouseDown` is prevented so a click does not select the letter text.
 * SVG `<text>` ignores `text-transform`, so the letter is uppercased here.
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
        !onClick && styles.inert,
        isCenter && styles.center,
        used && styles.used,
        // The tone class sets only the verdict tokens (`VERDICT_TONE`), which
        // is why a hex can wear one without being a `.tileFace`; `.answered`
        // maps them onto the shape and the text.
        answer && styles.answered,
        answer && VERDICT_TONE[answer],
        // The shared head-shake: every answer this hex can wear is a refusal.
        answer && shared.verdictShake,
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
