import type { jsPDF } from 'jspdf'
import {
  BLACK,
  DARK_GREY,
  drawHeader,
  drawSetup,
  fit,
  newPrintDoc,
  savePrint,
} from '../../common/pdf/frame'
import { drawInTracks, type Track } from '../../common/pdf/columns'
import { drawTurnLog, twoColGeom } from '../../common/pdf/turnLog'
import type { CategoryRank } from '../lib/board'
import type { ConnectionsPrintModel, PrintBand, PrintTrack } from './model'

/**
 * connections' print-to-PDF. The model (see ./model.ts) decides whose bands
 * belong on whose board; this file only draws.
 *
 * Two layouts, one per mode:
 *   - **coop** — the turn-log body family (docs/pdf.md): the shared board in
 *     the left column, `drawTurnLog` beneath it.
 *   - **compete** — one **track per player** (`common/pdf/columns.ts`, up to
 *     three per page): their own bands, their own leftover tiles, their own
 *     score line and guess list. A merged board is a lie in compete — every
 *     player races their own copy.
 *
 * The board drawing is the interesting part either way. On screen a solved
 * category is a full-width coloured band; that translates directly, with two
 * deliberate changes for paper:
 *
 *  1. **A thick coloured border, not a fill.** A band's colour is a full-bleed
 *     background on screen. Four of those is an enormous amount of ink for a
 *     home printer, and `pdf.md`'s "backgrounds are white" rule already says
 *     don't. The border carries the same hue at a fraction of the cost.
 *  2. **A letter A–D in the top-left.** Colour alone can't be the signal —
 *     mono flattens all four ranks to one grey — and `pdf.md` requires a shape
 *     or text carrying the same meaning. See `model.ts` for why A–D is a
 *     faithful stand-in rather than an arbitrary tag.
 */

/**
 * Print variants of the four rank colours.
 *
 * The screen tokens (`--connections-rank-N`: `#f9df6d` `#a0c35a` `#b0c4ef`
 * `#ba81c5`) are tuned as pale FILLS behind black text. Stroked as a 2.5pt
 * border on white they nearly vanish — pale yellow especially. These are the
 * same four hues taken darker so the border actually reads as a line. Keep the
 * order (rank 0..3 = easiest..hardest) in step with the screen tokens.
 */
const BORDER_RGB: Record<CategoryRank, [number, number, number]> = {
  0: [181, 150, 20], // yellow
  1: [104, 133, 47], // green
  2: [82, 108, 173], // blue
  3: [134, 74, 148], // purple
}

const BAND_BORDER_W = 2.5
const BAND_GAP = 6
const COLS = 4

/** Per-width drawing sizes: the full-width coop column vs a third-width
 *  compete track. One derived object so band and grid can't disagree. */
function sizesFor(w: number) {
  const compact = w < 250
  return compact
    ? { bandH: 34, nameSize: 8, tileLineSize: 7, letterSize: 9, tileH: 20, tileFontMax: 7 }
    : { bandH: 42, nameSize: 10, tileLineSize: 9, letterSize: 11, tileH: 26, tileFontMax: 9 }
}

/** Generate the PDF and hand it to the browser as a download. */
export function printConnectionsPdf(m: ConnectionsPrintModel): void {
  const pd = newPrintDoc()
  const { doc } = pd

  drawHeader(pd, m)

  if (m.mode === 'coop') {
    // ── Coop: the shared board (left column) + the newspaper guess flow ──
    const { leftX, colW, colTop } = twoColGeom(pd)
    const t = m.tracks[0]
    const y = drawBoard(doc, t, leftX, colTop, colW)
    drawTurnLog(pd, {
      startY: y + 14,
      moveLabel: 'Guess',
      rows: t.turns,
      setup: m.setup,
      mode: m.mode,
      emptyText: 'No guesses yet.',
    })
  } else {
    // ── Compete: one track per player — bands, tiles, score, own log ──
    const { bottom, left } = drawInTracks(pd, m.tracks, (t, track) =>
      drawCompeteTrack(doc, t, track),
    )
    if (m.setup.length) drawSetup(doc, m.setup, left, bottom + 18, m.mode)
  }

  savePrint(pd, m, 'connections')
}

/** One player's column: name, their board, their readout, their guesses. */
function drawCompeteTrack(doc: jsPDF, t: PrintTrack, track: Track): number {
  doc.setFont('helvetica', 'bold').setFontSize(10).setTextColor(BLACK)
  doc.text(fit(doc, t.who, track.width), track.x, track.top)

  let y = track.top + 8
  y = drawBoard(doc, t, track.x, y, track.width)

  y += 12
  doc.setFont('helvetica', 'normal').setFontSize(8).setTextColor(DARK_GREY)
  doc.text(fit(doc, t.result, track.width), track.x, y)
  y += 14

  return drawGuessList(doc, t, track, y)
}

/** A track's board — its bands, then whatever tiles aren't banded. Returns
 *  the y below the block. */
function drawBoard(doc: jsPDF, t: PrintTrack, x: number, y: number, w: number): number {
  const s = sizesFor(w)
  t.bands.forEach((b) => {
    drawBand(doc, b, x, y, w, s)
    y += s.bandH + BAND_GAP
  })
  if (t.remainingTiles.length) y = drawTiles(doc, t.remainingTiles, x, y, w, s)
  return y
}

/**
 * One solved category: a bordered box holding its letter, name and four words.
 * No fill — the border is the whole colour budget.
 */
function drawBand(
  doc: jsPDF,
  b: PrintBand,
  x: number,
  y: number,
  w: number,
  s: ReturnType<typeof sizesFor>,
): void {
  const [r, g, bl] = BORDER_RGB[b.rank]
  doc.setLineWidth(BAND_BORDER_W).setDrawColor(r, g, bl).rect(x, y, w, s.bandH, 'S')

  // The letter, top-left INSIDE the border — the B&W-safe rank signal. Drawn in
  // the band's own colour so it doubles as a swatch on a colour printer, but it
  // reads perfectly well as a plain bold letter without one.
  doc.setFont('helvetica', 'bold').setFontSize(s.letterSize).setTextColor(r, g, bl)
  doc.text(b.letter, x + 7, y + s.bandH * 0.33)

  // Name + members, indented past the letter so nothing collides with it.
  const textX = x + 20
  const textW = w - 26
  doc.setFont('helvetica', 'bold').setFontSize(s.nameSize).setTextColor(BLACK)
  doc.text(fit(doc, b.name, textW), textX, y + s.bandH * 0.36)
  doc.setFont('helvetica', 'normal').setFontSize(s.tileLineSize).setTextColor(BLACK)
  doc.text(fit(doc, b.tiles.join(' · '), textW), textX, y + s.bandH * 0.72)
}

/**
 * The tiles still in play, four to a row — bordered white boxes, matching the
 * screen's grid. Dark-grey borders, since an unsolved tile carries no rank and
 * so no colour. Returns the y below the block.
 */
function drawTiles(
  doc: jsPDF,
  tiles: string[],
  x: number,
  y: number,
  w: number,
  s: ReturnType<typeof sizesFor>,
): number {
  const cellW = w / COLS
  doc.setLineWidth(0.6).setDrawColor(DARK_GREY)
  // ONE size for every tile — the largest that fits the longest word, so the
  // grid reads evenly rather than each cell shrinking to its own content.
  doc.setFont('helvetica', 'bold').setFontSize(s.tileFontMax)
  const longest = tiles.reduce((t, w2) => (w2.length > t.length ? w2 : t), '')
  const size = Math.min(s.tileFontMax, (s.tileFontMax * (cellW - 8)) / Math.max(doc.getTextWidth(longest), 1))
  tiles.forEach((t, i) => {
    const px = x + (i % COLS) * cellW
    const py = y + Math.floor(i / COLS) * s.tileH
    doc.setDrawColor(DARK_GREY).rect(px, py, cellW, s.tileH, 'S')
    doc.setFontSize(size).setTextColor(BLACK)
    doc.text(t, px + cellW / 2, py + s.tileH / 2 + size * 0.35, { align: 'center' })
  })
  return y + Math.ceil(tiles.length / COLS) * s.tileH
}

/** A track's own guess list — the same compact shape the other track-family
 *  printers use. A budget is four mistakes + four solves, so it never
 *  paginates. */
function drawGuessList(doc: jsPDF, t: PrintTrack, track: Track, y: number): number {
  doc.setFont('helvetica', 'bold').setFontSize(9).setTextColor(BLACK)
  doc.text('Guesses', track.x, y)
  let cy = y + 12
  if (!t.turns.length) {
    doc.setFont('helvetica', 'normal').setFontSize(8).setTextColor(DARK_GREY)
    doc.text('None yet.', track.x, cy)
    return cy
  }
  t.turns.forEach((turn) => {
    doc.setFont('helvetica', 'normal').setFontSize(8.5).setTextColor(DARK_GREY)
    doc.text(String(turn.seq), track.x, cy)
    doc.setTextColor(BLACK)
    doc.text(fit(doc, turn.text, track.width - 14), track.x + 12, cy)
    cy += 11
  })
  return cy
}
