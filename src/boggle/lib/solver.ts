/**
 * Boggle board solver (the heart of boggle's board generator).
 *
 * Finds every dictionary word traceable on a board — through orthogonally or
 * diagonally adjacent tiles, no tile reused within a word — and reports the word
 * count, the longest word's length, and the score. The board generator
 * (`boggle-build-board`) rolls boards and calls this in a rejection-sampling loop
 * until one meets the setup's constraints; it only ever runs against the
 * **required** word list (see `docs/games/boggle.md`).
 *
 * Two design choices make it fast — and they're the *algorithm*, not the
 * language (a C port of this same approach is in `boggle-c-solver/`, used as the
 * golden-master parity oracle for the test beside this file):
 *
 *   1. A flat typed-array **trie** (not a minimised DAWG). A DAWG merges shared
 *      suffixes, so a node can't identify a word; a trie gives every word its own
 *      terminal node, which unlocks choice 2.
 *   2. Dedup via a **generation stamp** on the terminal node. A board lets you
 *      trace the same word along several paths, so we must dedup — but because a
 *      trie node *is* a word, "seen this word already this board?" is one array
 *      read/write (`seenGen[node] === gen`), with no word string built and no
 *      hashing. During rejection sampling, where ~all boards are discarded, that's
 *      the dominant saving.
 *
 * Board sizes 4×4, 5×5 and 6×6 are all supported (every wsboggle dice set ships).
 * We track used tiles with a small visited byte array rather than a single
 * 32-bit number, since 6×6 = 36 tiles overflows 32 bits.
 */

/** Multiface tiles, encoded in board strings as a digit. Each occupies one tile
 *  but contributes two letters (you can't use half a tile). Matches wsboggle's
 *  `MULTIFACE_DICE`: 1=Qu 2=In 3=Th 4=Er 5=He 6=An. */
export const MULTIFACE: Record<string, string> = {
  '1': 'qu', '2': 'in', '3': 'th', '4': 'er', '5': 'he', '6': 'an',
}

/** Scoring ladders ported from wsboggle (`scoring.py`), indexed by word length
 *  (lengths past the table clamp to its last entry). `basic` is standard Boggle. */
export const LADDERS = {
  flat:  [0, 0, 0, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1],
  basic: [0, 0, 0, 1, 1, 2, 3, 5, 11, 11, 11, 11, 11, 11, 11, 11, 11],
  fib:   [0, 0, 0, 1, 1, 2, 3, 5, 8, 13, 21, 34, 55, 89, 144, 233, 377],
  big:   [0, 0, 0, 1, 1, 2, 4, 6, 9, 12, 16, 20, 25, 30, 36, 42, 50],
} as const

export type LadderName = keyof typeof LADDERS

export function scoreFor(len: number, ladder: readonly number[]): number {
  return ladder[Math.min(len, ladder.length - 1)]
}

const A = 'a'.charCodeAt(0)

/** Flat trie: `children[node * 26 + letter]` is the child node (0 = none; node 0
 *  is the root, which nothing points back to, so 0 is unambiguous). `eow[node]`
 *  marks a word ending. */
export interface Trie {
  children: Int32Array
  eow: Uint8Array
  nNodes: number
}

/** Build a trie from a word list. Words are lower-cased; any word with a
 *  non-`a`–`z` character is skipped. */
export function buildTrie(words: readonly string[]): Trie {
  let cap = 1 << 16
  let children = new Int32Array(cap * 26)
  let eow = new Uint8Array(cap)
  let n = 1 // node 0 = root
  const grow = () => {
    cap *= 2
    const c = new Int32Array(cap * 26); c.set(children); children = c
    const e = new Uint8Array(cap); e.set(eow); eow = e
  }
  for (const raw of words) {
    const w = raw.toLowerCase()
    let node = 0
    let ok = true
    for (let i = 0; i < w.length; i++) {
      const c = w.charCodeAt(i) - A
      if (c < 0 || c >= 26) { ok = false; break }
      let nx = children[node * 26 + c]
      if (nx === 0) { nx = n++; if (n > cap) grow(); children[node * 26 + c] = nx }
      node = nx
    }
    if (ok) eow[node] = 1
  }
  return { children, eow, nNodes: n }
}

/** A board ready to solve. `first`/`second` hold letter indices (0–25) per tile;
 *  `first[cell]` is -1 for a **blank** tile (matches nothing), and `second[cell]`
 *  is -1 for a normal tile or the second letter of a multiface tile. `n` is the
 *  side length (board is `n × n`). */
export interface Board {
  n: number
  first: Int8Array
  second: Int8Array
}

/** Parse a board string (length `n²`; chars `A`–`Z`, a multiface digit `1`–`6`,
 *  or `0` for a blank tile) into a `Board`. Side length is inferred as `√length`. */
export function parseBoard(s: string): Board {
  const len = s.length
  const n = Math.round(Math.sqrt(len))
  if (n * n !== len) throw new Error(`non-square board of length ${len}`)
  const first = new Int8Array(len)
  const second = new Int8Array(len).fill(-1)
  for (let i = 0; i < len; i++) {
    const ch = s[i]
    if (ch === '0') { first[i] = -1; continue } // blank tile — matches nothing
    const multi = MULTIFACE[ch]
    if (multi) {
      first[i] = multi.charCodeAt(0) - A
      second[i] = multi.charCodeAt(1) - A
    } else {
      first[i] = ch.toLowerCase().charCodeAt(0) - A
    }
  }
  return { n, first, second }
}

export interface SolveOptions {
  minWordLength?: number
  ladder?: LadderName
  /** Generation fail-fast: abort the moment a board exceeds these (it'll be
   *  rejected anyway). Defaults to no cap (full enumeration, for scoring/parity). */
  maxWords?: number
  maxScore?: number
}

export interface SolveResult {
  count: number
  longest: number
  score: number
  /** True if a max cap tripped mid-solve (the result is partial; reject it). */
  busted: boolean
}

/** Adjacency lists for an `n × n` board, cached per size. Precomputing the
 *  neighbours keeps `/n` and `%n` (integer division — slow in a JS hot loop)
 *  out of the DFS; it just walks a flat list of cell indices. */
const neighborCache = new Map<number, Int8Array[]>()
function neighborsFor(n: number): Int8Array[] {
  let table = neighborCache.get(n)
  if (table) return table
  table = []
  for (let r = 0; r < n; r++) {
    for (let c = 0; c < n; c++) {
      const list: number[] = []
      for (let dr = -1; dr <= 1; dr++) {
        for (let dc = -1; dc <= 1; dc++) {
          if (dr === 0 && dc === 0) continue
          const nr = r + dr, nc = c + dc
          if (nr >= 0 && nr < n && nc >= 0 && nc < n) list.push(nr * n + nc)
        }
      }
      table.push(Int8Array.from(list))
    }
  }
  neighborCache.set(n, table)
  return table
}

/** Create a reusable solver bound to a trie. The returned `solve` keeps its
 *  scratch (the dedup-stamp array) across calls, so a rejection-sampling loop
 *  allocates nothing per board. A fresh solver per generation also means
 *  concurrent games never share mutable state — no reentrancy concerns. */
export function createSolver(trie: Trie) {
  const { children, eow } = trie
  const seenGen = new Int32Array(trie.nNodes)

  // Per-solve mutable state, captured by the DFS closure (reset each solve()).
  let first: Int8Array, second: Int8Array, neighbors: Int8Array[]
  let gen = 0
  let minLen = 3
  let ladder: readonly number[] = LADDERS.basic
  let maxWords = Infinity
  let maxScore = Infinity
  let count = 0, longest = 0, score = 0, busted = false
  // Used-tile set as a 64-bit mask split across two 32-bit numbers (JS bitwise
  // is 32-bit) — a register-resident number beats a typed array on the hottest
  // line (tested every DFS step). Two words cover 6×6's 36 tiles; cells 0–31 →
  // lo, 32–63 → hi.
  let usedLo = 0, usedHi = 0

  function dfs(cell: number, node: number, len: number): void {
    if (cell < 32) usedLo |= 1 << cell; else usedHi |= 1 << (cell - 32)

    if (len >= minLen && eow[node] && seenGen[node] !== gen) {
      seenGen[node] = gen
      count++
      score += scoreFor(len, ladder)
      if (len > longest) longest = len
      if (count > maxWords || score > maxScore) {
        if (cell < 32) usedLo &= ~(1 << cell); else usedHi &= ~(1 << (cell - 32))
        busted = true; return
      }
    }

    const nb = neighbors[cell]
    for (let k = 0; k < nb.length; k++) {
      const next = nb[k]
      if (next < 32 ? (usedLo & (1 << next)) : (usedHi & (1 << (next - 32)))) continue
      const f = first[next]
      if (f < 0) continue // blank tile — no letter, can't extend a word
      // Descend into the next tile, consuming its one (or two, for a multiface
      // tile) letters. Inlined — a per-step function call was a real cost.
      let node2 = children[node * 26 + f]
      if (node2 === 0) continue
      const sec = second[next]
      let len2: number
      if (sec >= 0) {
        node2 = children[node2 * 26 + sec]
        if (node2 === 0) continue
        len2 = len + 2
      } else {
        len2 = len + 1
      }
      dfs(next, node2, len2)
      if (busted) {
        if (cell < 32) usedLo &= ~(1 << cell); else usedHi &= ~(1 << (cell - 32))
        return
      }
    }

    if (cell < 32) usedLo &= ~(1 << cell); else usedHi &= ~(1 << (cell - 32))
  }

  /** Solve one board: find every distinct word (≥ min length) traceable through
   *  adjacent tiles, no tile reused. */
  function solve(b: Board, opts: SolveOptions = {}): SolveResult {
    first = b.first
    second = b.second
    neighbors = neighborsFor(b.n)
    minLen = opts.minWordLength ?? 3
    ladder = LADDERS[opts.ladder ?? 'basic']
    maxWords = opts.maxWords ?? Infinity
    maxScore = opts.maxScore ?? Infinity
    gen++
    count = 0; longest = 0; score = 0; busted = false
    usedLo = 0; usedHi = 0

    const cells = b.n * b.n
    for (let cell = 0; cell < cells; cell++) {
      // Start a word at this tile: descend from the root by its letter(s).
      if (first[cell] < 0) continue // blank tile
      let node = children[first[cell]]
      if (node === 0) continue
      const sec = second[cell]
      let len: number
      if (sec >= 0) {
        node = children[node * 26 + sec]
        if (node === 0) continue
        len = 2
      } else {
        len = 1
      }
      dfs(cell, node, len)
      if (busted) break
    }
    return { count, longest, score, busted }
  }

  return { solve }
}

export interface FoundWord {
  word: string
  points: number
}

/** List every distinct word (≥ min length) on a board, with its score — i.e. the
 *  actual word strings, which the hot `solve()` deliberately never builds.
 *
 *  Run this **once, on an accepted board**, to get its required-word list; it is
 *  not on the rejection-sampling path, so clarity beats speed here (plain
 *  recursion, a visited byte array, the word built as a list of letter indices).
 *  Its `(count, longest, score)` agree with `solve()` by construction. */
export function listWords(trie: Trie, board: Board, opts: SolveOptions = {}): FoundWord[] {
  const { children, eow } = trie
  const minLen = opts.minWordLength ?? 3
  const ladder = LADDERS[opts.ladder ?? 'basic']
  const { first, second, n } = board
  const neighbors = neighborsFor(n)
  const seen = new Uint8Array(trie.nNodes) // 1 once a terminal node is emitted
  const used = new Uint8Array(n * n)
  const letters: number[] = [] // letter indices of the in-progress word
  const out: FoundWord[] = []

  function emitIfWord(node: number): void {
    if (letters.length >= minLen && eow[node] && !seen[node]) {
      seen[node] = 1
      let word = ''
      for (const c of letters) word += String.fromCharCode(c + A)
      out.push({ word, points: scoreFor(letters.length, ladder) })
    }
  }

  function rec(cell: number, node: number): void {
    used[cell] = 1
    emitIfWord(node)
    const nb = neighbors[cell]
    for (let k = 0; k < nb.length; k++) {
      const next = nb[k]
      if (used[next]) continue
      const f = first[next]
      if (f < 0) continue // blank tile
      let node2 = children[node * 26 + f]
      if (node2 === 0) continue
      letters.push(f)
      const sec = second[next]
      if (sec >= 0) {
        node2 = children[node2 * 26 + sec]
        if (node2 === 0) { letters.pop(); continue }
        letters.push(sec)
      }
      rec(next, node2)
      letters.pop(); if (sec >= 0) letters.pop()
    }
    used[cell] = 0
  }

  for (let cell = 0; cell < n * n; cell++) {
    const f = first[cell]
    if (f < 0) continue // blank tile
    let node = children[f]
    if (node === 0) continue
    letters.push(f)
    const sec = second[cell]
    if (sec >= 0) {
      node = children[node * 26 + sec]
      if (node === 0) { letters.pop(); continue }
      letters.push(sec)
    }
    rec(cell, node)
    letters.pop(); if (sec >= 0) letters.pop()
  }
  return out
}
