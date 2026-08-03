import type { jsPDF } from 'jspdf'

/**
 * The drawn outcome marks — ✓ and ✗ — plus the neutral dash.
 *
 * **Why drawn rather than typed:** Helvetica has no ✓ or ✗ glyph, and jsPDF's
 * core fonts are WinAnsi, so the characters simply don't exist to print. Each
 * mark is therefore a couple of line segments.
 *
 * **Why they exist at all:** [`pdf.md`](../../../docs/pdf.md) forbids colour
 * being the only signal, because a mono printer flattens green and red to the
 * same grey. A mark carries the meaning by SHAPE, and colour is then a bonus on
 * a colour printer rather than the thing you depend on.
 *
 * Extracted from psychicnum's printer when codenamesduet became the second
 * consumer. The signature changed in the move: psychicnum drew "in this cell's
 * top-right corner", but codenamesduet needs a mark inside a small keycard
 * inset, so these take an explicit **centre and size** and let the caller decide
 * where that is. One mark vocabulary, positioned by whoever owns the layout.
 */

/** Every mark is drawn inside a `size`-square box centred on (cx, cy). */
export type MarkOpts = {
  /** Centre of the mark, in points. */
  cx: number
  cy: number
  /** Box side, in points. The mark fills most of it. */
  size: number
  /** Stroke colour. Meaning must survive without it — see above. */
  color: [number, number, number]
  /** Stroke weight; defaults to a size-proportional value that stays visible
   *  at the ~6pt sizes a keycard inset uses. */
  weight?: number
}

/** A checkmark — "an agent", "correct". */
export function drawCheck({ cx, cy, size, color, weight }: MarkOpts, doc: jsPDF): void {
  const s = size
  doc.setDrawColor(...color).setLineWidth(weight ?? Math.max(0.5, s * 0.16))
  // Down-right into the V, then up-right to the tip. Started left-of-centre and
  // slightly high so the finished tick sits optically centred in its box.
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
}

/** A cross — "the assassin", "a miss". */
export function drawCross({ cx, cy, size, color, weight }: MarkOpts, doc: jsPDF): void {
  const h = size / 2
  doc.setDrawColor(...color).setLineWidth(weight ?? Math.max(0.5, size * 0.18))
  doc.line(cx - h, cy - h, cx + h, cy + h)
  doc.line(cx + h, cy - h, cx - h, cy + h)
}

/** A dash — "a neutral / bystander". Deliberately the plainest of the three:
 *  it's the absence of a result, and reads that way against ✓ and ✗. */
export function drawDash({ cx, cy, size, color, weight }: MarkOpts, doc: jsPDF): void {
  const h = size / 2
  doc.setDrawColor(...color).setLineWidth(weight ?? Math.max(0.5, size * 0.18))
  doc.line(cx - h, cy, cx + h, cy)
}
