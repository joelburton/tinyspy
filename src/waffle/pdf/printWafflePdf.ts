import type { jsPDF } from 'jspdf'
import { BLACK, DARK_GREY, drawHeader, drawSetup, fit, newPrintDoc, savePrint } from '../../common/pdf/frame'
import { drawInTracks, type Track } from '../../common/pdf/columns'
import { drawTile, drawTileLegend } from '../../common/pdf/tiles'
import { GRID } from '../lib/waffle'
import type { PrintTrack, WafflePrintModel } from './model'

/**
 * waffle's print-to-PDF.
 *
 * Same shape as wordle's, and for the same reason: **one track per board**, each
 * with its own swap log, because a compete player's board and their swaps belong
 * together and a single wrapped log stream would separate them. See
 * `common/pdf/columns.ts`.
 *
 * The tiles use the shared `common/pdf/tiles` encoding — border and fill weight
 * rather than colour — which is what makes waffle printable at all: green,
 * yellow and grey are one grey on a mono printer, and waffle without its
 * feedback is a grid of unrelated letters.
 *
 * The four **holes** print as nothing at all. They're not un-guessed cells,
 * they're not part of the puzzle, and drawing an empty box there would invite
 * someone to try filling it in.
 */

/** Generate the PDF and hand it to the browser as a download. */
export function printWafflePdf(m: WafflePrintModel): void {
  const pd = newPrintDoc()
  const { doc } = pd

  drawHeader(pd, m)
  const { bottom, left } = drawInTracks(pd, m.tracks, (t, track) =>
    drawTrack(doc, t, track, m),
  )

  // Setup, once per document under the tracks — the same block every other
  // printer ends with.
  if (m.setup.length) drawSetup(doc, m.setup, left, bottom + 18, m.mode)

  savePrint(pd, m, 'waffle')
}

/** One player's column: name, 5×5 board, result, legend, swaps. */
function drawTrack(doc: jsPDF, t: PrintTrack, track: Track, m: WafflePrintModel): number {
  doc.setFont('helvetica', 'bold').setFontSize(10).setTextColor(BLACK)
  doc.text(fit(doc, t.who, track.width), track.x, track.top)

  const gap = 2
  const tile = (track.width - gap * (GRID - 1)) / GRID
  let y = track.top + 8

  t.cells.forEach((cell, i) => {
    // Holes draw nothing — drawTile's 'blank' state is borderless, so the
    // notches in the waffle shape read as absent rather than as empty slots.
    drawTile(doc, {
      x: track.x + (i % GRID) * (tile + gap),
      y: y + Math.floor(i / GRID) * (tile + gap),
      size: tile,
      letter: cell.letter,
      state: cell.state,
    })
  })
  y += GRID * (tile + gap) + 6

  doc.setFont('helvetica', 'normal').setFontSize(8).setTextColor(DARK_GREY)
  doc.text(fit(doc, t.result, track.width), track.x, y)
  y += 12

  y = drawTileLegend(doc, track.x, y, 7) + 10

  // The answer words, repeated per column so a column stands alone if pages get
  // separated. Terminal only — the model won't emit them earlier.
  if (m.solutionWords?.length) {
    doc.setFont('helvetica', 'bold').setFontSize(9).setTextColor(BLACK)
    doc.text('Answer', track.x, y)
    y += 11
    doc.setFont('helvetica', 'normal').setFontSize(8).setTextColor(BLACK)
    m.solutionWords.forEach((w) => {
      doc.text(fit(doc, w.toUpperCase(), track.width), track.x, y)
      y += 10
    })
    y += 4
  }

  return drawSwapList(doc, t, track, y)
}

/** That board's swaps, one per line. */
function drawSwapList(doc: jsPDF, t: PrintTrack, track: Track, y: number): number {
  doc.setFont('helvetica', 'bold').setFontSize(9).setTextColor(BLACK)
  doc.text('Swaps', track.x, y)
  let cy = y + 12
  if (!t.turns.length) {
    doc.setFont('helvetica', 'normal').setFontSize(8).setTextColor(DARK_GREY)
    doc.text('None yet.', track.x, cy)
    return cy
  }
  t.turns.forEach((turn) => {
    doc.setFont('helvetica', 'normal').setFontSize(8).setTextColor(DARK_GREY)
    doc.text(String(turn.seq), track.x, cy)
    doc.setTextColor(BLACK)
    // Coop names the swapper (one shared board, many hands); a compete track is
    // one person's, so the model leaves `who` empty and the line is just the move.
    const line = turn.who ? `${turn.text}  ${turn.who}` : turn.text
    doc.text(fit(doc, line, track.width - 14), track.x + 12, cy)
    cy += 10
  })
  return cy
}
