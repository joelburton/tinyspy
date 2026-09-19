// cs-audited-pdf

import type { jsPDF } from 'jspdf'

// The three marks a printed tile can carry — ✓, ✗ and the neutral dash —
// drawn from line segments, because jsPDF's core fonts are WinAnsi and have
// no such glyphs. Why a mark rather than a hue: doc.md → Details.

/** Where a mark goes: inside a `size`-square box centered on (cx, cy). The
 *  caller owns placement — a cell's corner, a keycard inset. */
export type MarkOpts = {
  // Center of the mark, in points.
  cx: number
  cy: number
  // Box side, in points. The mark fills most of it.
  size: number
  // Stroke color. The meaning must survive without it — the shape carries it.
  color: [number, number, number]
}

// The stroke weight follows the size, floored so a mark stays visible at the
// ~6pt sizes a keycard inset uses. Each mark restores the line width it found,
// so a caller's cell borders keep their own weight after a marked cell.

/** A checkmark — "an agent", "correct". */
export function drawCheck({ cx, cy, size, color }: MarkOpts, doc: jsPDF): void {
  const s = size
  const lw = doc.getLineWidth()
  doc.setDrawColor(...color).setLineWidth(Math.max(0.5, s * 0.16))
  // Down-right into the V, then up-right to the tip. Started left-of-center and
  // slightly high so the finished tick sits optically centered in its box.
  doc.lines(
    [
      [s * 0.28, s * 0.3],
      [s * 0.55, -s * 0.72],
    ],
    cx - s * 0.36,
    cy + s * 0.02,
    [1, 1],
    'S',
  )
  doc.setLineWidth(lw)
}

/** A cross — "the assassin", "a miss". */
export function drawCross({ cx, cy, size, color }: MarkOpts, doc: jsPDF): void {
  const h = size / 2
  const lw = doc.getLineWidth()
  doc.setDrawColor(...color).setLineWidth(Math.max(0.5, size * 0.18))
  doc.line(cx - h, cy - h, cx + h, cy + h)
  doc.line(cx + h, cy - h, cx - h, cy + h)
  doc.setLineWidth(lw)
}

/** A dash — "a neutral / bystander". Deliberately the plainest of the three:
 *  it's the absence of a result, and reads that way against ✓ and ✗. */
export function drawDash({ cx, cy, size, color }: MarkOpts, doc: jsPDF): void {
  const h = size / 2
  const lw = doc.getLineWidth()
  doc.setDrawColor(...color).setLineWidth(Math.max(0.5, size * 0.18))
  doc.line(cx - h, cy, cx + h, cy)
  doc.setLineWidth(lw)
}
