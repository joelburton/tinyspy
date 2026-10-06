// cs-unmet

/**
 * scrabble — the pure play engine: given the current board and a set of new
 * tile placements, decide whether the play is geometrically legal, read off
 * every word it forms, and score it.
 *
 * This is the ONLY place geometry, word-extraction, and scoring live — there is
 * no SQL re-implementation to keep in sync. scrabble uses a *trusting commit*:
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
  makeEmptyBoard,
  premiumAt,
  RACK_SIZE,
  readCellXY,
  // `.ts` extension: this module is on the Deno import graph (the
  // scrabble-suggest-move edge function imports it), and Deno requires
  // explicit extensions on the whole transitive graph.
} from './board.ts'
import type { GCell, GFormedWord, GPlacement, GTile, GWordCell } from '../types.ts'

type PlayEvaluation =
  | { valid: false; error: string }
  | { valid: true; words: GFormedWord[]; score: number; bingo: boolean }

const isEmpty = (board: GCell[], x: number, y: number) =>
  board[cellIndex(x, y)].tile === null

/** The tiles a play consumes from the rack: `?` per blank, else the letter. */
export const tilesUsed = (placements: GPlacement[]): string[] =>
  placements.map((p) => (p.blank ? BLANK : p.letter))

/**
 * Geometry gate. Returns an error string (suitable for FE feedback) or null.
 * Ordered so the friendliest / most-fundamental complaint wins. This is the
 * sole authority on a legal *shape*: the server does NOT re-run these checks —
 * it trusts the committed play (see the module header).
 */
function geometryError(board: GCell[], placements: GPlacement[]): string | null {
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

  const boardEmpty = board.every((c) => c.tile === null)
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
function formedWords(board: GCell[], placements: GPlacement[]): GFormedWord[] {
  const placed = new Map<number, { letter: string; blank: boolean }>()
  for (const p of placements)
    placed.set(cellIndex(p.x, p.y), { letter: p.letter, blank: p.blank })

  // The tile on a cell, the play's own over the board's; null when empty or
  // off the board.
  const at = (x: number, y: number): { letter: string; blank: boolean } | null => {
    if (!inBounds(x, y)) return null
    return placed.get(cellIndex(x, y)) ?? board[cellIndex(x, y)].tile
  }

  const runFrom = (x: number, y: number, dx: number, dy: number): GWordCell[] => {
    // Back up to the start of the run, then walk forward collecting cells.
    let sx = x
    let sy = y
    while (at(sx - dx, sy - dy)) {
      sx -= dx
      sy -= dy
    }
    const cells: GWordCell[] = []
    for (let cx = sx, cy = sy; at(cx, cy); cx += dx, cy += dy) {
      const c = at(cx, cy)!
      cells.push({ x: cx, y: cy, letter: c.letter, blank: c.blank, isNew: placed.has(cellIndex(cx, cy)) })
    }
    return cells
  }

  const byStart = new Map<string, GWordCell[]>()
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
    word: cells.map((c) => c.letter).join(''),
    score: scoreRun(cells),
  }))
}

/** Score one word: letter values (×letter premiums on new tiles) × word premiums. */
function scoreRun(cells: GWordCell[]): number {
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
export function evaluatePlay(board: GCell[], placements: GPlacement[]): PlayEvaluation {
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

/**
 * Replay the board as it stood **after a given turn** — lay every WORD play's
 * tiles with `id ≤ target` on an empty board (the other kinds place no tiles).
 * Used by the turn-viewer: the board is *defined* as the accumulation of
 * placements (the server builds it the same way), so this is a pure FE replay
 * — no per-turn board snapshot to store. A placement is the tile itself, so
 * a blank stays a blank. `events` need not be sorted (we filter, not slice):
 * every row written at or before `id` counts, and the database hands ids out in
 * the order rows were written.
 */
export function historyBoard(
  events: ReadonlyArray<{ id: number; kind: string; placements: GTile[] | null }>,
  id: number,
): GCell[] {
  const cells = makeEmptyBoard()
  for (const e of events) {
    if (e.id > id || e.kind !== 'word' || !e.placements) continue
    for (const tile of e.placements) {
      const { x, y } = readCellXY(tile.id)
      cells[cellIndex(x, y)] = { id: tile.id, tile }
    }
  }
  return cells
}

export { BOARD_SIZE }
