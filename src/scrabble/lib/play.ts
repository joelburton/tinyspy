/**
 * RackAttack — the pure play engine: given the current board and a set of new
 * tile placements, decide whether the play is geometrically legal, read off
 * every word it forms, and score it.
 *
 * This is the ONLY place geometry, word-extraction, and scoring live — there is
 * no SQL re-implementation to keep in sync. RackAttack uses a *trusting commit*:
 * the FE evaluates a play here (live score + word highlighting as tiles are
 * placed) and submits the words + score it computed; `scrabble.play_word`
 * TRUSTS those numbers and only adds what the client can't be the authority on —
 * the dictionary check, the draw from the hidden bag, and the bookkeeping. So
 * there's no cross-check / mirror test (there's nothing to mirror). See
 * docs/games/scrabble.md §6 for why that trade is the right call here.
 *
 * What this module does NOT do: check words against the dictionary (it has no
 * word list — the server uses `common.words`, the FE shows the words and lets
 * the server be the authority) and touch the rack/bag (the server owns those).
 * It answers only "is this a legal *shape*, and what does it spell + score?"
 */

import {
  BINGO_BONUS,
  BLANK,
  BOARD_SIZE,
  CENTER,
  cellIndex,
  cellValue,
  inBounds,
  premiumAt,
  RACK_SIZE,
  type Cell,
} from './board'

/**
 * One new tile a player is placing. `letter` is the uppercase letter it plays
 * as — for a blank that's the *declared* letter (permanent once committed, per
 * the Scrabble rule); `blank` flags that it came from a blank tile and so
 * scores 0. The rack tile it consumes is `?` when `blank`, else `letter`.
 */
export type Placement = { x: number; y: number; letter: string; blank: boolean }

/** A cell as it appears in a formed word, with whether this play placed it. */
type WordCell = { x: number; y: number; l: string; b: boolean; isNew: boolean }

/** A word formed by the play: the run's cells, its string, and its score. */
export type FormedWord = { word: string; score: number; cells: WordCell[] }

export type PlayEvaluation =
  | { valid: false; error: string }
  | { valid: true; words: FormedWord[]; score: number; bingo: boolean }

const isEmpty = (board: Cell[], x: number, y: number) =>
  board[cellIndex(x, y)] == null

/** The tiles a play consumes from the rack: `?` per blank, else the letter. */
export const tilesUsed = (placements: Placement[]): string[] =>
  placements.map((p) => (p.blank ? BLANK : p.letter))

/**
 * Geometry gate. Returns an error string (suitable for FE feedback) or null.
 * Ordered so the friendliest / most-fundamental complaint wins. This is the
 * sole authority on a legal *shape*: the server does NOT re-run these checks —
 * it trusts the committed play (see the module header).
 */
function geometryError(board: Cell[], placements: Placement[]): string | null {
  if (placements.length === 0) return 'Place at least one tile.'

  // Every placed cell must be on the board, empty, and distinct.
  const seen = new Set<number>()
  for (const p of placements) {
    if (!inBounds(p.x, p.y)) return 'Tiles must be on the board.'
    const i = cellIndex(p.x, p.y)
    if (seen.has(i)) return 'Two tiles on the same square.'
    seen.add(i)
    if (!isEmpty(board, p.x, p.y)) return 'A tile overlaps an existing tile.'
  }

  // Single row or single column. (A one-tile play satisfies both.)
  const sameRow = placements.every((p) => p.y === placements[0].y)
  const sameCol = placements.every((p) => p.x === placements[0].x)
  if (!sameRow && !sameCol)
    return 'Tiles must line up in a single row or column.'

  const boardEmpty = board.every((c) => c == null)
  if (boardEmpty) {
    // Opening play: must cover the center star and be a real (≥2) word.
    if (!seen.has(CENTER)) return 'The first word must cover the center star.'
    if (placements.length < 2) return 'The first word must be at least 2 tiles.'
  }

  // Contiguity: along the line of play, every square between the first and
  // last placed tile must be filled — by a new tile or one already on the
  // board (which is how a play legally bridges over existing tiles).
  const horizontal = sameRow
  const line = horizontal ? placements.map((p) => p.x) : placements.map((p) => p.y)
  const fixed = horizontal ? placements[0].y : placements[0].x
  for (let v = Math.min(...line); v <= Math.max(...line); v++) {
    const x = horizontal ? v : fixed
    const y = horizontal ? fixed : v
    const placedHere = seen.has(cellIndex(x, y))
    if (!placedHere && isEmpty(board, x, y))
      return 'Tiles must be contiguous — no gaps.'
  }

  // Connectivity (after the opening play): at least one new tile must touch an
  // existing tile. Bridging over an existing tile (above) implies adjacency,
  // so this also accepts plays that fill a gap between existing tiles.
  if (!boardEmpty) {
    const touches = placements.some((p) =>
      [
        [p.x - 1, p.y],
        [p.x + 1, p.y],
        [p.x, p.y - 1],
        [p.x, p.y + 1],
      ].some(
        ([nx, ny]) => inBounds(nx, ny) && !isEmpty(board, nx, ny),
      ),
    )
    if (!touches) return 'New tiles must connect to the existing tiles.'
  }

  return null
}

/**
 * Read off every word the play forms. We overlay the placements on the board,
 * then for each new tile walk its maximal horizontal and vertical run; any run
 * of length ≥ 2 is a formed word. De-duping by (axis, start cell) collapses the
 * shared main word (which every collinear new tile sits in) to one entry while
 * keeping each distinct perpendicular cross-word. Reading runs off the board
 * — rather than anagramming the tiles — is what makes the main word and its
 * cross-words fall out uniformly.
 */
function formedWords(board: Cell[], placements: Placement[]): FormedWord[] {
  const placed = new Map<number, { l: string; b: boolean }>()
  for (const p of placements)
    placed.set(cellIndex(p.x, p.y), { l: p.letter, b: p.blank })

  const at = (x: number, y: number): { l: string; b: boolean } | null => {
    if (!inBounds(x, y)) return null
    return placed.get(cellIndex(x, y)) ?? board[cellIndex(x, y)]
  }

  const runFrom = (x: number, y: number, dx: number, dy: number): WordCell[] => {
    // Back up to the start of the run, then walk forward collecting cells.
    let sx = x
    let sy = y
    while (at(sx - dx, sy - dy)) {
      sx -= dx
      sy -= dy
    }
    const cells: WordCell[] = []
    for (let cx = sx, cy = sy; at(cx, cy); cx += dx, cy += dy) {
      const c = at(cx, cy)!
      cells.push({ x: cx, y: cy, l: c.l, b: c.b, isNew: placed.has(cellIndex(cx, cy)) })
    }
    return cells
  }

  const byStart = new Map<string, WordCell[]>()
  for (const p of placements) {
    for (const [dx, dy] of [
      [1, 0],
      [0, 1],
    ]) {
      const run = runFrom(p.x, p.y, dx, dy)
      if (run.length < 2) continue
      const key = `${dx},${dy}:${cellIndex(run[0].x, run[0].y)}`
      byStart.set(key, run)
    }
  }

  return [...byStart.values()].map((cells) => ({
    cells,
    word: cells.map((c) => c.l).join(''),
    score: scoreRun(cells),
  }))
}

/** Score one word: letter values (×letter premiums on new tiles) × word premiums. */
function scoreRun(cells: WordCell[]): number {
  let letters = 0
  let wordMult = 1
  for (const c of cells) {
    let v = cellValue(c)
    if (c.isNew) {
      const prem = premiumAt(c.x, c.y)
      if (prem === 'DL') v *= 2
      else if (prem === 'TL') v *= 3
      else if (prem === 'DW') wordMult *= 2
      else if (prem === 'TW') wordMult *= 3
    }
    letters += v
  }
  return letters * wordMult
}

/**
 * The whole evaluation the FE preview wants: legal? what words? what score?
 * `bingo` (+50) lands when the play uses a full rack of 7 tiles. The server's
 * `play_word` does NOT recompute any of this — it trusts the submitted `words`
 * + `score` and only checks each `word` against the dictionary before accepting.
 */
export function evaluatePlay(board: Cell[], placements: Placement[]): PlayEvaluation {
  const error = geometryError(board, placements)
  if (error) return { valid: false, error }

  const words = formedWords(board, placements)
  if (words.length === 0)
    // Defensive: a connected, contiguous play always forms ≥1 word.
    return { valid: false, error: 'That play forms no word.' }

  const bingo = placements.length === RACK_SIZE
  const score =
    words.reduce((sum, w) => sum + w.score, 0) + (bingo ? BINGO_BONUS : 0)
  return { valid: true, words, score, bingo }
}

export { BOARD_SIZE }
