import type { jsPDF } from 'jspdf'
import { BLACK, DARK_GREY, drawHeader, drawSetup, newPrintDoc, savePrint } from '../../common/pdf/frame'
import { twoColGeom } from '../../common/pdf/turnLog'
import { decode, type Card } from '../lib/cards'
import { CARD_BOX, SYMBOL_ASPECT, SYMBOL_BOX } from '../lib/shapes'
import type { Palette } from '../lib/setup'
import type { PrintTurn, SetgamePrintModel } from './model'

/**
 * setgame's print-to-PDF — **the log** (see [`model.ts`](./model.ts) for why
 * there is nothing else worth printing).
 *
 * It draws its own two-column flow rather than composing `drawTurnLog`, because
 * that helper's row is `{ seq, who, text }` and setgame's row is a PICTURE. The
 * alternative was writing the sets out — "2 red striped diamonds · 1 red solid
 * oval · 3 red open squiggles" — which is three lines of prose per turn and
 * unreadable down a column. The column GEOMETRY is still shared (`twoColGeom`),
 * so the page lines up with every other printout.
 *
 * ── Shading on paper ────────────────────────────────────────────────────────
 * Real hatching, clipped to the shape (jsPDF's `clip()`), because the two
 * cheaper approximations both failed when looked at: a light TINT reads as a
 * muted solid rather than as stripes, and unclipped lines overflow a diamond.
 *
 * The pitch and the card size are set together. At the first size (15pt wide)
 * the hatch had two or three lines in it and, again, just looked like a muted
 * solid; a symbol about 16pt tall with a 3pt pitch reads as stripes at arm's
 * length, which is the bar — a printout is looked at, not zoomed.
 *
 * Only the card's WIDTH is chosen here. Its height and its symbols' height both
 * come from `lib/shapes.ts`, so a reshape on screen (the 2.5 → 2.1 symbol, which
 * also shortened the card) lands on paper without anyone remembering to.
 *
 * Color is MEANING here and can't be moved onto shape or line weight, since
 * both are already attributes. The cards print in whatever palette the game was
 * played with, and a table that chose the colorblind-safe one also gets a
 * printout whose greyscale lightnesses are evenly spaced (L* 46 / 61 / 70) —
 * close to this doc's three-shade ramp, so it survives a mono printer.
 */

/** The two palettes as RGB — `theme.css`'s values, which a PDF can't read. */
const PIGMENT: Record<Palette, Record<string, [number, number, number]>> = {
  traditional: { red: [212, 42, 42], green: [18, 146, 47], purple: [123, 45, 142] },
  colorblind: { red: [0, 114, 178], green: [230, 159, 0], purple: [204, 121, 167] },
}

/**
 * Card geometry in points. The width is chosen so the hatching reads (above);
 * the height FOLLOWS the shared card proportion rather than being typed in.
 */
const CARD = {
  w: 30,
  h: (30 * CARD_BOX.height) / CARD_BOX.width,
  gap: 3,
}
/** One log row: the card, plus a little air. */
const ROW_H = CARD.h + 4
/** Gap between hatch lines. Wide enough to read as stripes at this card size. */
const HATCH_PITCH = 3

/**
 * The squiggle, as the relative cubics jsPDF wants — a mechanical rewrite of
 * the SAME path the board draws (`SHAPE_PATHS.squiggle` in lib/shapes.ts,
 * whose absolute SVG cubics live in `SYMBOL_BOX`).
 *
 * Converted rather than re-drawn, and that matters: the first version was a
 * print-only approximation, and it came out a thin ribbon with no interior — so
 * solid, hatched and open were indistinguishable on it, which is three of the
 * game's nine shadings gone. Sharing the geometry means the paper squiggle
 * cannot drift from the screen one again.
 */
const SQUIGGLE: number[][] = [
  [0, -14, 12, -20, 22, -16],
  [9, 4, 11, 16, 6, 28],
  [-4, 10, -8, 14, -10, 20],
  [-2, 8, 4, 14, 8, 18],
  [4, 6, 0, 14, -8, 12],
  [-10, -2, -20, -12, -18, -26],
  [2, -12, 8, -18, 10, -24],
  [2, -8, -4, -10, -10, -12],
]
/** Where that path starts, in `SYMBOL_BOX` units — the `M` of the screen path. */
const SQUIGGLE_START = { x: 6, y: 20 }

/** Trace one symbol into the current path, painting it with `style` (null just
 *  builds the path — which is what clipping needs). */
function drawSymbol(
  doc: jsPDF,
  shape: 'diamond' | 'squiggle' | 'oval',
  x: number,
  y: number,
  w: number,
  h: number,
  style: 'F' | 'S' | 'FD' | null,
) {
  if (shape === 'diamond') {
    doc.lines([[w / 2, h / 2], [-w / 2, h / 2], [-w / 2, -h / 2]], x + w / 2, y, [1, 1], style, true)
    return
  }
  if (shape === 'oval') {
    // Narrower than its slot. A diamond tapers and a squiggle is a ribbon, so
    // only the oval is at full width the whole way down — at three pips they
    // crowd their neighbors while the other two look airy. The inset costs
    // nothing (the shape is still plainly an oval) and evens the three out.
    const ow = w * 0.78
    doc.roundedRect(x + (w - ow) / 2, y, ow, h, ow / 2, ow / 2, style)
    return
  }
  doc.lines(
    SQUIGGLE,
    x + (w * SQUIGGLE_START.x) / SYMBOL_BOX.width,
    y + (h * SQUIGGLE_START.y) / SYMBOL_BOX.height,
    [w / SYMBOL_BOX.width, h / SYMBOL_BOX.height],
    style,
    true,
  )
}

/**
 * One card: its border, then `pips` symbols in the game's palette. The symbols
 * share the card's width, so a three-pip card's are narrow — exactly as on
 * screen, where the count is read off how many there are, not how big they are.
 */
function drawCard(doc: jsPDF, card: Card, x: number, y: number, palette: Palette) {
  const { pips, color, shade, shape } = decode(card)
  const rgb = PIGMENT[palette][color]

  doc.setDrawColor(128, 128, 128).setLineWidth(0.4)
  doc.roundedRect(x, y, CARD.w, CARD.h, 1.5, 1.5, 'S')

  const sw = (CARD.w - 4) / 3.3
  // Derived, never guessed: a hand-picked height here would stretch the shapes
  // relative to the board the moment either proportion moved.
  const sh = sw * SYMBOL_ASPECT
  const total = pips * sw + (pips - 1)
  const left = x + (CARD.w - total) / 2
  const top = y + (CARD.h - sh) / 2

  for (let i = 0; i < pips; i++) {
    const sx = left + i * (sw + 1)
    doc.setDrawColor(rgb[0], rgb[1], rgb[2]).setLineWidth(0.8).setFillColor(rgb[0], rgb[1], rgb[2])

    if (shade === 'solid') {
      drawSymbol(doc, shape, sx, top, sw, sh, 'FD')
    } else if (shade === 'open') {
      drawSymbol(doc, shape, sx, top, sw, sh, 'S')
    } else {
      // Hatched: clip to the shape, rule lines across it, then draw the outline
      // back on top so the edge stays crisp.
      doc.saveGraphicsState()
      drawSymbol(doc, shape, sx, top, sw, sh, null)
      doc.clip().discardPath()
      doc.setLineWidth(0.9)
      for (let ly = top; ly < top + sh; ly += HATCH_PITCH) doc.line(sx - 1, ly, sx + sw + 1, ly)
      doc.restoreGraphicsState()
      drawSymbol(doc, shape, sx, top, sw, sh, 'S')
    }
  }
}

/** `#12  [card][card][card]   joel`, or a hint's one to three. */
function drawTurn(doc: jsPDF, turn: PrintTurn, x: number, y: number, palette: Palette) {
  doc.setFont('helvetica', 'normal').setFontSize(8).setTextColor(DARK_GREY)
  doc.text(`#${turn.n}`, x, y + CARD.h / 2 + 3)

  let cardX = x + 20
  if (turn.kind === 'hint') {
    // Named, because three cards with no label read as a find — exactly
    // backwards. The screen says it twice (this word and an amber bar); paper
    // has the word.
    doc.text('Hint', cardX, y + CARD.h / 2 + 3)
    cardX += 20
  }

  for (const card of turn.cards) {
    drawCard(doc, card, cardX, y, palette)
    cardX += CARD.w + CARD.gap
  }

  doc.setFont('helvetica', 'normal').setFontSize(9).setTextColor(BLACK)
  doc.text(turn.who, cardX + 6, y + CARD.h / 2 + 3)
}

/** Generate the PDF and hand it to the browser as a download. */
export function printSetgamePdf(m: SetgamePrintModel): void {
  const pd = newPrintDoc()
  const { doc, margin, pageBottom } = pd
  const { leftX, rightX, colW, colTop } = twoColGeom(pd)

  drawHeader(pd, m)

  // ── Per-player totals ──────────────────────────────────────────────
  let y = margin + 46
  doc.setFont('helvetica', 'bold').setFontSize(11).setTextColor(BLACK)
  doc.text('Players', leftX, y)
  y += 14
  doc.setFont('helvetica', 'normal').setFontSize(10)
  for (const row of m.scores) {
    doc.text(
      `${row.name} — ${row.sets} found, ${row.hints} hint${row.hints === 1 ? '' : 's'}`,
      leftX,
      y,
    )
    y += 13
  }

  // ── The log, down the left column then the right ───────────────────
  y += 10
  doc.setFont('helvetica', 'bold').setFontSize(11).setTextColor(BLACK)
  doc.text('Turns', leftX, y)
  y += 12

  let col: 0 | 1 = 0
  const colX = () => (col === 0 ? leftX : rightX)
  const nextColumn = () => {
    if (col === 0) {
      col = 1
      y = colTop
    } else {
      doc.addPage()
      col = 0
      y = margin
    }
  }

  if (m.turns.length === 0) {
    doc.setFont('helvetica', 'normal').setFontSize(10).setTextColor(DARK_GREY)
    doc.text('No turns yet.', leftX, y)
    y += ROW_H
  }

  for (const turn of m.turns) {
    if (y + ROW_H > pageBottom) nextColumn()
    drawTurn(doc, turn, colX(), y, m.palette)
    y += ROW_H
  }

  // Setup goes last, after the log it describes.
  if (y + 70 > pageBottom) nextColumn()
  drawSetup(doc, m.setup, colX(), y + 14, m.mode, colW)

  savePrint(pd, m, 'setgame')
}
