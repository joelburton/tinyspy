import type { jsPDF } from 'jspdf'
import { BLACK, DARK_GREY, drawHeader, drawSetup, fit, newPrintDoc, savePrint, type PrintHeader, type SetupRow } from '../../common/pdf/frame'
import { drawInTracks, type Track } from '../../common/pdf/columns'

/**
 * bananagrams's print-to-PDF — the **track family** (docs/pdf.md; see
 * `common/pdf/columns.ts`): one column per player, each with that player's
 * board and the words on it.
 *
 * It used to print ONE board — the caller's — with the setup beside it, which
 * in compete is most of the game missing: everyone builds their own crossword,
 * and the whole point of a record is comparing them.
 *
 * **Two columns, not the family's usual three.** A Bananagrams grid sprawls
 * across a 25×25 arena, so it's much wider than a wordle or waffle board; at a
 * third of a page its tiles shrink past reading. Two is the compromise that
 * keeps a realistic two-player game side by side on one sheet.
 *
 * Peers' boards only exist at terminal — `player_boards` is owner-only while
 * the race is on — so during play this prints a single column, the caller's.
 */

/** One printed column: whose board, the board, and its words. */
export type BananagramsTrack = {
  /** Column heading — the player's name. */
  who: string
  /** The used part of the board, row-major + cropped to the tiles
   *  (`boardToGrid`): each cell an UPPERCASE letter, or `''` for a gap. */
  board: string[][]
  /** Every word on that board, de-duped + alphabetical. */
  words: string[]
  /** "13 tiles placed · 2 words" for this board alone. */
  result: string
}

/** The print payload — plain data, built by the caller from the live board(s). */
export type BananagramsPrintModel = PrintHeader & {
  tracks: BananagramsTrack[]
}

const TILE_BORDER_W = 0.8 // board-tile border weight (matches boggle's grid)
/** Columns per page. Two, because the board is wide — see the docstring. */
const TRACKS = 2
/** Padding between a board's outer border and its tiles. */
const FRAME_PAD = 5
/** A board taller than this many tiles gets scaled down to fit its column. */
const MAX_TILES_DOWN = 26

/** Generate the PDF and hand it to the browser as a download. */
export function printBananagramsPdf(m: BananagramsPrintModel): void {
  const pd = newPrintDoc()
  const { doc } = pd

  drawHeader(pd, m)
  const { bottom, left } = drawInTracks(pd, m.tracks, (t, track) => drawTrack(doc, t, track), TRACKS)

  // Setup once per document, under the columns — it describes the GAME, so
  // repeating it per player would say the same thing twice.
  if (m.setup.length) drawSetup(doc, m.setup, left, bottom + 18, m.mode)

  savePrint(pd, m, 'bananagrams')
}

/** One player's column: name, bordered board, tally, then the board's words. */
function drawTrack(doc: jsPDF, t: BananagramsTrack, track: Track): number {
  doc.setFont('helvetica', 'bold').setFontSize(10).setTextColor(BLACK)
  doc.text(fit(doc, t.who, track.width), track.x, track.top)

  let y = drawBoard(doc, t.board, track) + 10

  doc.setFont('helvetica', 'normal').setFontSize(8).setTextColor(DARK_GREY)
  doc.text(fit(doc, t.result, track.width), track.x, y)
  y += 14

  return drawWords(doc, t.words, track, y)
}

/**
 * The board, inside a thin border.
 *
 * The border is what makes two boards side by side legible at all: a
 * Bananagrams crossword is a ragged shape floating in space, so without a frame
 * its edge is wherever the last tile happens to be and the eye can't tell where
 * one player's grid stops and the next begins. It's a structural line, which is
 * what `pdf.md` reserves rules for.
 *
 * Tile size is driven by the column: as large as fits the width, capped so a
 * very tall board still fits down the page rather than running off it.
 */
function drawBoard(doc: jsPDF, board: string[][], track: Track): number {
  const top = track.top + 8
  const rows = board.length
  const cols = rows ? board[0].length : 0

  if (!rows || !cols) {
    // An empty board is a real state (nobody has placed a tile yet). Say so
    // inside the same frame, so the column still reads as a board.
    doc.setLineWidth(0.5).setDrawColor(DARK_GREY)
    doc.rect(track.x, top, track.width, 40)
    doc.setFont('helvetica', 'normal').setFontSize(8).setTextColor(DARK_GREY)
    doc.text('No tiles placed yet.', track.x + FRAME_PAD, top + 22)
    return top + 40
  }

  const inner = track.width - 2 * FRAME_PAD
  const tile = Math.min(inner / cols, (MAX_TILES_DOWN * inner) / cols / rows, 18)
  const gridW = cols * tile
  const gridH = rows * tile
  // Centre a narrow board in its column so the frame doesn't sit lopsided.
  const gx = track.x + (track.width - gridW) / 2
  const gy = top + FRAME_PAD

  doc.setLineWidth(0.5).setDrawColor(DARK_GREY)
  doc.rect(track.x, top, track.width, gridH + 2 * FRAME_PAD)

  doc.setLineWidth(TILE_BORDER_W)
  board.forEach((row, r) =>
    row.forEach((letter, c) => {
      if (!letter) return // a gap inside the crossword draws nothing
      const px = gx + c * tile
      const py = gy + r * tile
      doc.setFillColor(255, 255, 255).setDrawColor(BLACK).rect(px, py, tile, tile, 'FD')
      const size = Math.min(10, tile * 0.62)
      doc.setFont('helvetica', 'normal').setFontSize(size).setTextColor(BLACK)
      doc.text(letter, px + tile / 2, py + tile / 2 + size * 0.35, { align: 'center' })
    }),
  )

  return top + gridH + 2 * FRAME_PAD
}

/** That board's words, two per line — they're short and there can be many. */
function drawWords(doc: jsPDF, words: string[], track: Track, y: number): number {
  doc.setFont('helvetica', 'bold').setFontSize(9).setTextColor(BLACK)
  doc.text('Words', track.x, y)
  let cy = y + 12
  if (!words.length) {
    doc.setFont('helvetica', 'normal').setFontSize(8).setTextColor(DARK_GREY)
    doc.text('None yet.', track.x, cy)
    return cy
  }
  const colW = track.width / 2
  doc.setFont('helvetica', 'normal').setFontSize(8).setTextColor(BLACK)
  words.forEach((w, i) => {
    const col = i % 2
    doc.text(fit(doc, w, colW - 4), track.x + col * colW, cy)
    if (col === 1) cy += 10
  })
  if (words.length % 2 === 1) cy += 10
  return cy
}

export type { SetupRow }
