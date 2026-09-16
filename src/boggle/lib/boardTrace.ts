// cs-unmet

/**
 * Client-side board tracing — "can this word be spelled along adjacent tiles,
 * no tile reused?" The FE uses it to gate guesses before submitting: only
 * traceable words go to `submit_word` (trusting-commit — the server doesn't
 * re-trace; see docs/games/boggle.md §4). Mirrors the solver's DFS rules,
 * including multiface tiles (Qu, …) matching their two letters together and
 * blank tiles matching nothing.
 */
import { parseBoard, type Board } from './solver'

const A = 'a'.charCodeAt(0)

/** How many cells `traceCells` will step onto before it gives up counting
 *  routes. A real board never comes near it; a custom board of one repeated
 *  letter would multiply routes without end. */
const STEP_BUDGET = 200_000

/**
 * WHERE `word` traces on the board — the cells it uses, in order — or null if it
 * cannot be traced at all.
 *
 * `traceable` is this question asked for a yes or no, and it is the one the
 * submit gate needs. This one is for marking: a refused word wears its answer on
 * the tiles it used, and those tiles have to be found, because a typed word says
 * nothing about WHICH of two Es it meant.
 *
 * A word with more than one route gets the first the walk finds, in the cell
 * order below. Arbitrary, invisible to the player (the word is refused either
 * way), and worth knowing it is a choice rather than a fact.
 */
export function tracePath(board: Board, word: string): number[] | null {
  const w = word.toLowerCase()
  const len = w.length
  if (len === 0) return null
  const target = new Int8Array(len)
  for (let i = 0; i < len; i++) target[i] = w.charCodeAt(i) - A

  const { n, first, second } = board
  const used = new Uint8Array(n * n)
  const path: number[] = []

  function dfs(cell: number, pos: number): boolean {
    if (first[cell] !== target[pos]) return false
    let next = pos + 1
    if (second[cell] >= 0) {
      if (next >= len || second[cell] !== target[next]) return false
      next++
    }
    path.push(cell)
    if (next === len) return true

    used[cell] = 1
    const row = (cell / n) | 0
    const col = cell % n
    for (let dr = -1; dr <= 1; dr++) {
      for (let dc = -1; dc <= 1; dc++) {
        if (dr === 0 && dc === 0) continue
        const nr = row + dr, nc = col + dc
        if (nr < 0 || nr >= n || nc < 0 || nc >= n) continue
        const ncell = nr * n + nc
        if (used[ncell]) continue
        if (dfs(ncell, next)) { used[cell] = 0; return true }
      }
    }
    used[cell] = 0
    path.pop()
    return false
  }

  for (let cell = 0; cell < n * n; cell++) {
    if (dfs(cell, 0)) return path
    path.length = 0
  }
  return null
}

/** …the same walk against a raw board string (the `boggle.games.board` shape). */
export function tracePathStr(boardStr: string, word: string): number[] | null {
  return tracePath(parseBoard(boardStr), word)
}

/** Where the typed word's letters can sit, and how far the board follows it. */
export type TraceCells = {
  /** Cells no route can avoid — one per letter position that has a single candidate. */
  certain: number[]
  /** Cells that carry a letter position with more than one candidate. */
  possible: number[]
  /** How many letters the board can actually spell, from the start. Equal to the
   *  word's length while it still traces; the letters past it are the ones the
   *  board cannot follow, and the entry box dims them. */
  reach: number
}

/**
 * WHERE the board could put each letter of `word`, collapsed to two sets of
 * cells, plus how far into the word the board can follow at all.
 *
 * For lighting the board as a word is typed. A letter with one candidate is
 * settled and the tile says so outright; a letter with two (the second of two
 * Es, say) lights both, faintly, which is the honest answer — one of these, not
 * yet known which. Typing on either narrows it, and the board never has to take
 * a light BACK from a tile it had claimed.
 *
 * That last part is why the marks describe the longest traceable PREFIX rather
 * than the whole word: typing a letter the board can't follow leaves the tiles
 * exactly where they were, and `reach` is what tells the entry box to dim the
 * letter instead. GO on the board and no T after it means G and O stay lit.
 *
 * Every route is walked, so this is the expensive one of the three in this file
 * — bounded by `STEP_BUDGET` for a board of repeated letters, where the routes
 * multiply. Past the budget it reports every cell it reached as merely POSSIBLE:
 * the walk stopped early, so it can no longer tell a settled letter from an open
 * one, and saying "maybe" about all of them is the version that isn't a lie.
 */
export function traceCells(board: Board, word: string): TraceCells {
  const w = word.toLowerCase()
  const len = w.length
  if (len === 0) return { certain: [], possible: [], reach: 0 }
  const target = new Int8Array(len)
  for (let i = 0; i < len; i++) target[i] = w.charCodeAt(i) - A

  const { n, first, second } = board
  const used = new Uint8Array(n * n)

  /** Every route that spells the word's first `upto` letters, reported as the
   *  cells that can carry each of those positions — and how far past `upto` the
   *  walk got, which is what a first pass over the whole word is for. */
  function walk(upto: number) {
    // A multiface tile (Qu) carries two positions at once, so this is indexed by
    // LETTER, not by step.
    const carriers: Set<number>[] = Array.from({ length: upto }, () => new Set<number>())
    // The route in hand, as (cell, the positions it covers) — read out whenever
    // the walk completes one.
    const route: { cell: number; from: number; to: number }[] = []
    let steps = STEP_BUDGET
    let reach = 0

    function dfs(cell: number, pos: number): void {
      if (steps-- <= 0 || first[cell] !== target[pos]) return
      let next = pos + 1
      if (second[cell] >= 0) {
        if (next >= len || second[cell] !== target[next]) return
        next++
      }
      if (next > reach) reach = next
      route.push({ cell, from: pos, to: Math.min(next, upto) })
      if (next >= upto) {
        for (const leg of route) for (let p = leg.from; p < leg.to; p++) carriers[p].add(leg.cell)
        route.pop()
        return
      }

      used[cell] = 1
      const row = (cell / n) | 0
      const col = cell % n
      for (let dr = -1; dr <= 1; dr++) {
        for (let dc = -1; dc <= 1; dc++) {
          if (dr === 0 && dc === 0) continue
          const nr = row + dr, nc = col + dc
          if (nr < 0 || nr >= n || nc < 0 || nc >= n) continue
          const ncell = nr * n + nc
          if (used[ncell]) continue
          dfs(ncell, next)
        }
      }
      used[cell] = 0
      route.pop()
    }

    used.fill(0)
    for (let cell = 0; cell < n * n; cell++) dfs(cell, 0)
    return { carriers, reach, spent: steps <= 0 }
  }

  // The first walk asks the whole word and answers how much of it the board can
  // take. If that is less than all of it, the marks belong to the prefix, so the
  // walk runs again for exactly that much.
  const full = walk(len)
  const { carriers, spent } = full.reach >= len ? full : walk(full.reach)

  const certain = new Set<number>()
  const possible = new Set<number>()
  for (const cells of carriers) {
    if (cells.size === 1 && !spent) certain.add([...cells][0])
    else for (const cell of cells) possible.add(cell)
  }
  // A settled letter's cell belongs to no other letter — no route can reuse it —
  // so the two sets never overlap. Subtracted anyway: the budget can end a walk
  // mid-route, and half a route proves nothing about which set a cell is in.
  for (const cell of certain) possible.delete(cell)
  return { certain: [...certain], possible: [...possible], reach: full.reach }
}

/** …the same, against a raw board string. */
export function traceCellsStr(boardStr: string, word: string): TraceCells {
  return traceCells(parseBoard(boardStr), word)
}

/** Can `word` be traced on a parsed board? */
export function traceable(board: Board, word: string): boolean {
  const w = word.toLowerCase()
  const len = w.length
  if (len === 0) return false
  const target = new Int8Array(len)
  for (let i = 0; i < len; i++) target[i] = w.charCodeAt(i) - A

  const { n, first, second } = board
  const used = new Uint8Array(n * n)

  // From `cell`, try to consume the word starting at `pos`. The cell must match
  // word[pos] (and word[pos+1] too, for a multiface tile).
  function dfs(cell: number, pos: number): boolean {
    if (first[cell] !== target[pos]) return false
    let next = pos + 1
    if (second[cell] >= 0) {
      if (next >= len || second[cell] !== target[next]) return false
      next++
    }
    if (next === len) return true

    used[cell] = 1
    const row = (cell / n) | 0
    const col = cell % n
    for (let dr = -1; dr <= 1; dr++) {
      for (let dc = -1; dc <= 1; dc++) {
        if (dr === 0 && dc === 0) continue
        const nr = row + dr, nc = col + dc
        if (nr < 0 || nr >= n || nc < 0 || nc >= n) continue
        const ncell = nr * n + nc
        if (used[ncell]) continue
        if (dfs(ncell, next)) { used[cell] = 0; return true }
      }
    }
    used[cell] = 0
    return false
  }

  for (let cell = 0; cell < n * n; cell++) {
    if (dfs(cell, 0)) return true
  }
  return false
}

/** Convenience: trace against a raw board string (the `boggle.games.board` shape). */
export function traceableStr(boardStr: string, word: string): boolean {
  return traceable(parseBoard(boardStr), word)
}
