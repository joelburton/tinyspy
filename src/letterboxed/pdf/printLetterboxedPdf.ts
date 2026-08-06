import type { jsPDF } from 'jspdf'
import {
  BLACK,
  DARK_GREY,
  MEDIUM_GREY,
  drawHeader,
  drawSetup,
  fit,
  newPrintDoc,
  savePrint,
} from '../../common/pdf/frame'
import { drawInTracks, type Track } from '../../common/pdf/columns'
import { SIDE_SIZE } from '../lib/board'
import type { LetterboxedPrintModel, PrintTrack } from './model'

/**
 * letterboxed's print-to-PDF.
 *
 * **One track per board**, not the newspaper turn-log flow: in compete each
 * player builds a DIFFERENT chain on the same twelve letters, so a wrapped
 * single stream would file one player's words under another player's board. The
 * shared `common/pdf/columns` lays out up to three per page (see its header for
 * why three).
 *
 * ── Marking a covered letter without colour ──────────────────────────────────
 * On screen a covered letter is a pale green fill. On a mono printer that is the
 * same grey as everything else, so the encoding moves onto WEIGHT: a covered
 * letter gets a heavy black ring and a bold glyph, an untouched one a thin grey
 * ring and normal weight. That survives a photocopier, which is the test
 * docs/pdf.md sets.
 */

/** Where along a side the three letters sit — mirrors the on-screen layout. */
const STOPS = [0.2, 0.5, 0.8]

/** Generate the PDF and hand it to the browser as a download. */
export function printLetterboxedPdf(m: LetterboxedPrintModel): void {
  const pd = newPrintDoc()
  const { doc } = pd

  drawHeader(pd, m)

  const { bottom, left } = drawInTracks(pd, m.tracks, (t, track) =>
    drawTrack(doc, t, track, m),
  )

  // Setup, once per document under the tracks — the same block every other
  // printer ends with, so a reader finds the game's options where they expect.
  if (m.setup.length) drawSetup(doc, m.setup, left, bottom + 18, m.mode)

  savePrint(pd, m, 'letterboxed')
}

/** One player's column: name, board, standing, chain, moves. */
function drawTrack(
  doc: jsPDF,
  t: PrintTrack,
  track: Track,
  m: LetterboxedPrintModel,
): number {
  // Who this column belongs to. In coop it says "Team" — one board, so the
  // heading is about the board, not a person.
  doc.setFont('helvetica', 'bold').setFontSize(10).setTextColor(BLACK)
  doc.text(fit(doc, t.who, track.width), track.x, track.top)

  let y = drawBoard(doc, m.sides, new Set(t.covered), track, track.top + 10) + 12

  doc.setFont('helvetica', 'normal').setFontSize(8).setTextColor(DARK_GREY)
  doc.text(fit(doc, t.result, track.width), track.x, y)
  y += 14

  y = drawChain(doc, t, track, y) + 8

  // The solution, printed per column so a column stands alone if the pages get
  // separated. The model emits it only when the players revealed it on screen.
  if (m.solution) {
    doc.setFont('helvetica', 'bold').setFontSize(8.5).setTextColor(BLACK)
    doc.text(
      // '->' not '→': jsPDF's core fonts are WinAnsi and print the arrow as
      // mojibake (docs/pdf.md → the character note).
      fit(doc, `Solvable in two: ${m.solution.map((w) => w.toUpperCase()).join(' -> ')}`, track.width),
      track.x,
      y,
    )
    y += 14
  }

  return drawMoves(doc, t, track, y)
}

/**
 * The square, letters on its four sides. Drawn to the track's width, so a
 * three-up page gives each board a third of the sheet.
 */
function drawBoard(
  doc: jsPDF,
  sides: string,
  covered: ReadonlySet<string>,
  track: Track,
  top: number,
): number {
  const r = Math.min(track.width / 9, 11)
  const box = track.width - 2 * r // the square itself, inset so nodes fit
  const x0 = track.x + r
  const at = (f: number) => f * box

  doc.setDrawColor(MEDIUM_GREY).setLineWidth(0.6)
  doc.rect(x0, top, box, box)

  // Clockwise from the top-left, matching the screen: side 0 across the top,
  // 1 down the right, 2 back along the bottom, 3 up the left.
  const nodes: { ch: string; cx: number; cy: number }[] = []
  const group = (s: number) => [...sides.slice(s * SIDE_SIZE, (s + 1) * SIDE_SIZE)]
  group(0).forEach((ch, i) => nodes.push({ ch, cx: x0 + at(STOPS[i]), cy: top }))
  group(1).forEach((ch, i) => nodes.push({ ch, cx: x0 + box, cy: top + at(STOPS[i]) }))
  group(2).forEach((ch, i) =>
    nodes.push({ ch, cx: x0 + at(STOPS[SIDE_SIZE - 1 - i]), cy: top + box }),
  )
  group(3).forEach((ch, i) =>
    nodes.push({ ch, cx: x0, cy: top + at(STOPS[SIDE_SIZE - 1 - i]) }),
  )

  nodes.forEach((n) => {
    const on = covered.has(n.ch)
    // Weight, not colour: a heavy black ring is "covered", a thin grey one
    // isn't. Both survive a mono printer, where the screen's two greens don't.
    doc.setFillColor(255, 255, 255)
    doc.setDrawColor(on ? BLACK : MEDIUM_GREY).setLineWidth(on ? 1.4 : 0.5)
    doc.circle(n.cx, n.cy, r, 'FD')
    doc
      .setFont('helvetica', on ? 'bold' : 'normal')
      .setFontSize(r * 1.05)
      .setTextColor(BLACK)
    doc.text(n.ch.toUpperCase(), n.cx, n.cy + r * 0.36, { align: 'center' })
  })

  return top + box + r
}

/** The chain, as the sequence it is — a numbered list, one word per row. */
function drawChain(doc: jsPDF, t: PrintTrack, track: Track, y: number): number {
  doc.setFont('helvetica', 'bold').setFontSize(9).setTextColor(BLACK)
  doc.text('Chain', track.x, y)
  let cy = y + 12
  if (!t.chain.length) {
    doc.setFont('helvetica', 'normal').setFontSize(8).setTextColor(DARK_GREY)
    doc.text('No words yet.', track.x, cy)
    return cy
  }
  doc.setFont('helvetica', 'normal').setFontSize(8.5).setTextColor(BLACK)
  t.chain.forEach((w, i) => {
    // Numbered rather than arrowed: the order is the point, and a printed list
    // already reads top-to-bottom. (An arrow would also need to be '->' here —
    // core fonts are WinAnsi; see docs/pdf.md.)
    doc.setTextColor(DARK_GREY)
    doc.text(String(i + 1), track.x, cy)
    doc.setTextColor(BLACK)
    doc.text(fit(doc, w.toUpperCase(), track.width - 14), track.x + 12, cy)
    cy += 11
  })
  return cy
}

/**
 * That board's moves — the full log, retreats and help included, because on
 * paper "what did we try?" is most of what a finished game is worth keeping.
 */
function drawMoves(doc: jsPDF, t: PrintTrack, track: Track, y: number): number {
  doc.setFont('helvetica', 'bold').setFontSize(9).setTextColor(BLACK)
  doc.text('Moves', track.x, y)
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
