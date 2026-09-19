// cs-audited-pdf

import type { jsPDF } from 'jspdf'
import type { TileColor } from './tileColor'
import { BLACK, DARK_GRAY, MEDIUM_GRAY } from '@/common/pdf/frame'

// The printed form of a Wordle-style letter tile: the four `TileColor` states
// as border and fill weight rather than hue, so a mono printer and a color one
// produce the same page. It lives in this family's folder, not `common/pdf`,
// because it reads `TileColor` and the shell may not import a family
// (docs/common-folders.md); why the fill is allowed at all is
// `common/pdf/doc.md` → Details.

/** One tile's box. `size` is the side; the letter is centered. */
export type TileBox = {
  x: number
  y: number
  size: number
  letter: string
  state: TileColor
  // Draw a `blank` tile as an empty outlined box instead of nothing: a board's
  // unplayed rows are slots still to fill, where a keyboard's untried letters
  // are not. It cannot be confused with "not in word", which always carries a
  // letter where this never does.
  outlineBlank?: boolean
}

// Fill levels, chosen so the two filled states stay distinct after the ~15%
// darkening a real printer adds (dot gain), and so a dark tile's white letter
// keeps enough contrast.
const YELLOW_FILL = 205
const GREEN_FILL = 105

// The legend's swatch side: small, since it sits in a track under the board.
const LEGEND_TILE = 7

/**
 * Draw one tile; the caller lays out the grid. The four states, read as an
 * intensity ordering with darkest = best:
 *
 *   blank   (not used yet)  → nothing at all (an outlined box with `outlineBlank`)
 *   gray    (not in word)   → border only, white inside
 *   yellow  (wrong place)   → light gray fill
 *   green   (right place)   → dark gray fill, white letter
 */
export function drawTile(doc: jsPDF, t: TileBox): void {
  const { x, y, size, state } = t

  if (state === 'wordleYellow' || state === 'wordleGreen') {
    const level = state === 'wordleGreen' ? GREEN_FILL : YELLOW_FILL
    doc.setFillColor(level, level, level)
    doc.setDrawColor(DARK_GRAY).setLineWidth(0.6)
    doc.rect(x, y, size, size, 'FD')
  } else if (state === 'wordleGray') {
    doc.setDrawColor(DARK_GRAY).setLineWidth(0.6)
    doc.rect(x, y, size, size, 'S')
  } else if (t.outlineBlank) {
    // A slot still to fill — lighter than a played tile's border so the grid
    // reads as "three rows played, three to go" at a glance.
    doc.setDrawColor(MEDIUM_GRAY).setLineWidth(0.5)
    doc.rect(x, y, size, size, 'S')
  }
  // An un-outlined 'blank' draws no box at all.

  if (!t.letter.trim()) return
  // White on the dark fill, black everywhere else — the only place the letter's
  // own color carries anything, and it's a contrast decision, not a code.
  const fontSize = size * 0.58
  doc.setFont('helvetica', 'bold').setFontSize(fontSize)
  if (state === 'wordleGreen') doc.setTextColor(255, 255, 255)
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
export function drawTileLegend(doc: jsPDF, x: number, y: number): number {
  const size = LEGEND_TILE
  const items: [TileColor, string][] = [
    ['wordleGray', 'not in word'],
    ['wordleYellow', 'wrong place'],
    ['wordleGreen', 'right place'],
  ]
  let cx = x
  items.forEach(([state, label]) => {
    drawTile(doc, { x: cx, y: y - size + 2, size, letter: '', state })
    doc.setFont('helvetica', 'normal').setFontSize(7.5).setTextColor(DARK_GRAY)
    doc.text(label, cx + size + 3, y)
    cx += size + 3 + doc.getTextWidth(label) + 10
  })
  return y + 4
}
