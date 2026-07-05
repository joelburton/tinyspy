/**
 * Grid renderer. Draws cells, numbers, and fills. Check-history flags
 * (`revealed`, `wrong`) are intentionally ignored — the print output
 * shows the puzzle, not the solver's grading history. `pencil` is a
 * player annotation rather than a check result, so it IS preserved:
 * pencil fills render in italic, non-bold, light gray so a mid-solve
 * printout makes it obvious which cells are guesses (and gives
 * ink/pencil room to overwrite them on paper). `circled`, `shaded`,
 * `given`, `number`, and `fill` are all preserved.
 *
 * Deviation from the crossplay source (see the crosswords plan): the
 * cryptic edge marks (`markRight` / `markBottom`) are dropped here
 * exactly as they were dropped from the ported `Cell` type — nothing
 * in this port sets or reads them, so their draw code went with them.
 */

import type { jsPDF } from 'jspdf'
import type { Cell, GridSnapshot } from '../lib/types'
import type { Rect } from './layout'
import { cellSize } from './layout'
import { FONT_SANS, NUMBER_SIZE } from './fonts'

const BLACK: [number, number, number] = [0, 0, 0]
const SHADE_GRAY: [number, number, number] = [217, 217, 217] // ≈ 0.85 lightness
const PENCIL_GRAY: [number, number, number] = [140, 140, 140]
const BORDER_WIDTH = 0.5

/**
 * Render the grid into the rectangle at the top-left of `rect`.
 * Grid is square: `rect.w` is the bounding side length; the puzzle's
 * width drives the cell size.
 */
export function drawGrid(doc: jsPDF, snapshot: GridSnapshot, rect: Rect): void {
  const cells = snapshot.cells
  const rows = cells.length
  const cols = rows > 0 ? cells[0]!.length : 0
  if (rows === 0 || cols === 0) return

  const size = cellSize(rect, cols)

  doc.setLineWidth(BORDER_WIDTH)
  doc.setDrawColor(...BLACK)

  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const cell = cells[r]![c]!
      const x = rect.x + c * size
      const y = rect.y + r * size
      drawCell(doc, cell, x, y, size)
    }
  }
}

function drawCell(doc: jsPDF, cell: Cell, x: number, y: number, size: number): void {
  if (cell.kind === 'block') {
    if (cell.hidden) return // transparent void cell — paint nothing
    doc.setFillColor(...BLACK)
    doc.rect(x, y, size, size, 'F')
    return
  }

  // Open cell: optional shading background, then border, then overlays.
  if (cell.shaded) {
    doc.setFillColor(...SHADE_GRAY)
    doc.rect(x, y, size, size, 'F')
  }
  doc.setDrawColor(...BLACK)
  doc.rect(x, y, size, size, 'S')

  if (cell.circled) {
    const inset = size * 0.08
    const cx = x + size / 2
    const cy = y + size / 2
    const rx = size / 2 - inset
    doc.ellipse(cx, cy, rx, rx, 'S')
  }

  if (cell.number != null) {
    doc.setFont(FONT_SANS, 'normal')
    doc.setFontSize(NUMBER_SIZE)
    // Top-left, with a small inset. jsPDF text baselines are
    // alphabetic by default; setting baseline to "top" lets us
    // anchor relative to the cell's top edge.
    doc.text(String(cell.number), x + 1.5, y + 1.5, { baseline: 'top' })
  }

  if (cell.fill) {
    drawFill(doc, cell.fill, x, y, size, cell.given === true, cell.pencil === true)
  }
}

function drawFill(
  doc: jsPDF,
  fill: string,
  x: number,
  y: number,
  size: number,
  given: boolean,
  pencil: boolean,
): void {
  const baseSize = size * 0.6
  // For rebus fills (length > 1) shrink to fit cell width.
  let fontSize = baseSize
  if (fill.length > 1) {
    fontSize = Math.min(baseSize, (size * 0.9) / fill.length)
    fontSize = Math.max(fontSize, size * 0.18)
  }
  // Pencil fills render italic + non-bold + gray so a mid-solve
  // printout makes guesses obvious and easy to write over on paper.
  // Regular fills (and givens) stay bold black.
  doc.setFont(FONT_SANS, pencil ? 'italic' : 'bold')
  doc.setFontSize(fontSize)
  if (pencil) doc.setTextColor(...PENCIL_GRAY)

  const cx = x + size / 2
  // Vertical center: jsPDF "middle" baseline puts the geometric middle
  // at y, which lands the letter visually slightly low — bias up a hair.
  const cy = y + size / 2 + fontSize * 0.05
  doc.text(fill, cx, cy, { align: 'center', baseline: 'middle' })

  if (given) {
    // Short underline beneath the letter. Width is roughly the
    // measured text width; jsPDF needs the current font + size set
    // for getTextWidth to be meaningful.
    const w = doc.getTextWidth(fill)
    const underY = y + size / 2 + fontSize * 0.45
    doc.setLineWidth(0.4)
    doc.line(cx - w / 2, underY, cx + w / 2, underY)
    doc.setLineWidth(BORDER_WIDTH)
  }
  // Restore the default text color so subsequent draws (numbers in
  // following cells, title, clue text) don't inherit the gray.
  if (pencil) doc.setTextColor(...BLACK)
}
