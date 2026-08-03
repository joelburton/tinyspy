import type { jsPDF } from 'jspdf'
import { BLACK, DARK_GREY, drawHeader, drawSetup, fit, newPrintDoc, savePrint } from '../../common/pdf/frame'
import { drawInTracks, type Track } from '../../common/pdf/columns'
import { drawTile, drawTileLegend } from '../../common/pdf/tiles'
import type { TileColor } from '../../common/lib/color/tileColor'
import type { PrintTrack, WordlePrintModel } from './model'

/**
 * wordle's print-to-PDF.
 *
 * Not the turn-log family: a wordle page is **one track per board** — grid,
 * keyboard, then that board's guesses — because in compete each player has their
 * own board and a wrapped single-stream log would file one player's guesses
 * under another player's grid. See `common/pdf/columns.ts`.
 *
 * The four tile states are the shared `common/pdf/tiles` encoding (border and
 * fill weight, not colour), which is the whole reason this game is printable at
 * all: on a mono printer green/yellow/grey are one grey, and wordle without its
 * feedback is just a list of words.
 *
 * The keyboard prints in its **on-screen QWERTY shape**, three rows, because
 * that's the layout your eye already knows — an A-Z run would be denser but you'd
 * have to hunt for each letter instead of recognising the pattern.
 */

const KEY_ROWS = ['qwertyuiop', 'asdfghjkl', 'zxcvbnm'] as const

/** Generate the PDF and hand it to the browser as a download. */
export function printWordlePdf(m: WordlePrintModel): void {
  const pd = newPrintDoc()
  const { doc } = pd

  drawHeader(pd, m)

  const { bottom, left } = drawInTracks(pd, m.tracks, (t, track) =>
    drawTrack(doc, t, track, m),
  )

  // Setup, once per document under the tracks — the same block every other
  // printer ends with, so a reader finds the game's options where they expect.
  if (m.setup.length) drawSetup(doc, m.setup, left, bottom + 18)

  savePrint(pd, m, 'wordle')
}

/** One player's column: name, board, keyboard, guesses. */
function drawTrack(doc: jsPDF, t: PrintTrack, track: Track, m: WordlePrintModel): number {
  const cols = t.rows[0]?.states.length ?? 5
  const gap = 2
  const tile = (track.width - gap * (cols - 1)) / cols

  // Who this column belongs to. In coop it says "Team" — one board, so the
  // heading is about the board, not a person.
  doc.setFont('helvetica', 'bold').setFontSize(10).setTextColor(BLACK)
  doc.text(fit(doc, t.who, track.width), track.x, track.top)

  let y = track.top + 8
  t.rows.forEach((row) => {
    row.states.forEach((state, c) => {
      drawTile(doc, {
        x: track.x + c * (tile + gap),
        y,
        size: tile,
        letter: row.letters[c] ?? '',
        state,
        // Un-played rows print as empty outlined slots, so the grid keeps its
        // full six-row shape instead of floating above a void.
        outlineBlank: true,
      })
    })
    y += tile + gap
  })

  y += 6
  doc.setFont('helvetica', 'normal').setFontSize(8).setTextColor(DARK_GREY)
  doc.text(fit(doc, t.result, track.width), track.x, y)
  y += 12

  y = drawKeyboard(doc, t.keys, track, y) + 10

  // The answer, printed once per column so a column stands alone if the pages
  // get separated. Terminal only — the model won't emit it before then.
  if (m.target) {
    doc.setFont('helvetica', 'bold').setFontSize(9).setTextColor(BLACK)
    doc.text(fit(doc, `Answer: ${m.target}`, track.width), track.x, y)
    y += 12
  }

  y = drawTileLegend(doc, track.x, y, 7) + 8
  return drawGuessList(doc, t, track, y)
}

/**
 * The QWERTY keyboard, three rows, each centred like the on-screen one. A letter
 * never tried has no state and draws as the blank (borderless) tile, so what you
 * see is exactly "these are still untouched".
 */
function drawKeyboard(
  doc: jsPDF,
  keys: ReadonlyMap<string, TileColor>,
  track: Track,
  y: number,
): number {
  const gap = 1.5
  // Size from the LONGEST row so every row shares a key size — the shape only
  // reads as a keyboard if the rows line up.
  const key = (track.width - gap * (KEY_ROWS[0].length - 1)) / KEY_ROWS[0].length
  let cy = y
  KEY_ROWS.forEach((row) => {
    const rowW = row.length * key + (row.length - 1) * gap
    const startX = track.x + (track.width - rowW) / 2 // centred, as on screen
    ;[...row].forEach((ch, i) => {
      drawTile(doc, {
        x: startX + i * (key + gap),
        y: cy,
        size: key,
        letter: ch,
        state: keys.get(ch.toUpperCase()) ?? 'blank',
      })
    })
    cy += key + gap
  })
  return cy
}

/**
 * That board's guesses, as plain words — no tile treatment, since the grid above
 * already carries every colour and repeating it here would be noise.
 */
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
