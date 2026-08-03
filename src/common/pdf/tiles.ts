import type { jsPDF } from 'jspdf'
import type { TileColor } from '../lib/color/tileColor'
import { BLACK, DARK_GREY } from './frame'

/**
 * The printed form of a **Wordle-style letter tile** — the four states wordle
 * and waffle share (`common/lib/color/tileColor`).
 *
 * On screen these are four colours. On paper they can't be, because the whole
 * point of a printout is that it survives a black-and-white printer, and green /
 * yellow / grey flatten to nearly the same grey. So the four states are carried
 * by **border and fill weight** instead — an ordering you can read as intensity,
 * darkest = best:
 *
 *   blank  (not used yet)  → no border at all. An empty slot, not a result.
 *   gray   (not in word)   → border only, white inside. Tried, and it's out.
 *   yellow (wrong place)   → light grey fill. Present but misplaced.
 *   green  (right place)   → dark grey fill, white letter. The strongest mark.
 *
 * ─── This is a deliberate exception to "backgrounds are white" ───────────
 * [`pdf.md`](../../../docs/pdf.md) says don't fill tiles, and says outcome
 * meaning should ride a ✓/✗-style mark instead. That rule assumes there's room
 * for a mark beside the content — and a letter tile has none: the letter IS the
 * content, and a mark next to it at this size is unreadable. The four states are
 * also the entire game rather than a decoration, which is exactly the "unless a
 * filled background is specifically agreed to communicate something" case the
 * rule carves out. Using **greys rather than hues** keeps it honest by
 * construction: what you see on a colour printer is what you see on a mono one.
 */

/** One tile's box. `size` is the side; the letter is centred. */
export type TileBox = {
  x: number
  y: number
  size: number
  letter: string
  state: TileColor
}

/** Fill levels, chosen so the two filled states stay distinct after the ~15%
 *  darkening a real printer adds (dot gain), and so a dark tile's white letter
 *  keeps enough contrast. */
const YELLOW_FILL = 205
const GREEN_FILL = 105

/**
 * Draw one tile. Returns nothing — callers lay out the grid.
 *
 * A `blank` tile draws NOTHING but its letter (usually there isn't one): an
 * unused row should read as empty space, not as a box you might mistake for a
 * played-and-rejected letter.
 */
export function drawTile(doc: jsPDF, t: TileBox): void {
  const { x, y, size, state } = t

  if (state === 'yellow' || state === 'green') {
    const level = state === 'green' ? GREEN_FILL : YELLOW_FILL
    doc.setFillColor(level, level, level)
    doc.setDrawColor(DARK_GREY).setLineWidth(0.6)
    doc.rect(x, y, size, size, 'FD')
  } else if (state === 'gray') {
    doc.setDrawColor(DARK_GREY).setLineWidth(0.6)
    doc.rect(x, y, size, size, 'S')
  }
  // 'blank' draws no box at all.

  if (!t.letter.trim()) return
  // White on the dark fill, black everywhere else — the only place the letter's
  // own colour carries anything, and it's a contrast decision, not a code.
  const fontSize = size * 0.58
  doc.setFont('helvetica', 'bold').setFontSize(fontSize)
  if (state === 'green') doc.setTextColor(255, 255, 255)
  else doc.setTextColor(BLACK)
  doc.text(t.letter.toUpperCase(), x + size / 2, y + size / 2 + fontSize * 0.35, {
    align: 'center',
  })
}

/**
 * The legend for the four states. Worth printing wherever the tiles are: the
 * border/fill ordering is legible once you know it, and guessable-but-not-certain
 * before that.
 */
export function drawTileLegend(
  doc: jsPDF,
  x: number,
  y: number,
  size = 9,
): number {
  const items: [TileColor, string][] = [
    ['gray', 'not in word'],
    ['yellow', 'wrong place'],
    ['green', 'right place'],
  ]
  let cx = x
  items.forEach(([state, label]) => {
    drawTile(doc, { x: cx, y: y - size + 2, size, letter: '', state })
    doc.setFont('helvetica', 'normal').setFontSize(7.5).setTextColor(DARK_GREY)
    doc.text(label, cx + size + 3, y)
    cx += size + 3 + doc.getTextWidth(label) + 10
  })
  return y + 4
}
