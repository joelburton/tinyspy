/**
 * Board generation: roll a dice set and rejection-sample until a board meets the
 * setup's constraints — measured against the **required** words only (see
 * `docs/games/boggle.md`). The edge function calls this, then writes the game.
 *
 * Everything here is SYNCHRONOUS on purpose. The solver keeps mutable scratch
 * across the loop; a caller must not `await` between iterations (keep the whole
 * roll→solve loop sync, put the DB write strictly after it).
 */

// NB: explicit .ts extensions — the boggle-build-board edge function imports this
// module graph, and Deno requires extensions. Vite/Vitest/tsc accept them too
// (tsconfig `allowImportingTsExtensions`).
import { createSolver, listWords, parseBoard } from './solver.ts'
import type { FoundWord, LadderName, Trie } from './solver.ts'
import type { DiceSet } from './dice.ts'

/** Deterministic PRNG (mulberry32). Board generation is seeded so a board is
 *  reproducible from its seed — per CLAUDE.md's trust table, seeds are
 *  server-chosen for fairness, not secrecy. */
export function mulberry32(seed: number): () => number {
  let a = seed >>> 0
  return function next(): number {
    a = (a + 0x6d2b79f5) | 0
    let t = Math.imul(a ^ (a >>> 15), 1 | a)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

/** Roll one board: Fisher–Yates shuffle the dice across cells, then pick a random
 *  face per die. Returns the row-major raw-face string (length n²). */
export function rollBoard(set: DiceSet, rand: () => number): string {
  const order = set.dice.slice()
  for (let i = order.length - 1; i > 0; i--) {
    const j = (rand() * (i + 1)) | 0
    const tmp = order[i]; order[i] = order[j]; order[j] = tmp
  }
  let board = ''
  for (let i = 0; i < order.length; i++) board += order[i][(rand() * 6) | 0]
  return board
}

export interface BoardConstraints {
  minWordLength?: number
  ladder?: LadderName
  minWords?: number
  maxWords?: number
  minScore?: number
  maxScore?: number
  minLongest?: number
  maxLongest?: number
}

export interface GeneratedBoard {
  /** row-major raw-face string (A–Z, multiface digit, or 0 for blank) */
  board: string
  n: number
  requiredWords: FoundWord[]
  count: number
  longest: number
  score: number
  /** how many rolls it took (diagnostics: did the constraints make it slow?) */
  tries: number
}

/** Roll + solve until a board meets every constraint, or `null` if `maxTries` is
 *  exhausted (the caller should relax the constraints and tell the player). */
export function generateBoard(
  trie: Trie,
  set: DiceSet,
  constraints: BoardConstraints,
  seed: number,
  maxTries = 200_000,
): GeneratedBoard | null {
  const { solve } = createSolver(trie)
  const rand = mulberry32(seed)

  const minWordLength = constraints.minWordLength ?? 3
  const ladder = constraints.ladder ?? 'basic'
  const minWords = constraints.minWords ?? 0
  const maxWords = constraints.maxWords ?? Infinity
  const minScore = constraints.minScore ?? 0
  const maxScore = constraints.maxScore ?? Infinity
  const minLongest = constraints.minLongest ?? 0
  const maxLongest = constraints.maxLongest ?? Infinity
  // max-words/max-score fail-fast inside the solver; the rest are post-checks.
  const solveOpts = { minWordLength, ladder, maxWords, maxScore }

  for (let tries = 1; tries <= maxTries; tries++) {
    const boardStr = rollBoard(set, rand)
    const board = parseBoard(boardStr)
    const r = solve(board, solveOpts)
    if (r.busted) continue
    if (r.count < minWords) continue
    if (r.score < minScore) continue
    if (r.longest < minLongest || r.longest > maxLongest) continue
    // Accepted — materialise the required-word list once.
    const requiredWords = listWords(trie, board, { minWordLength, ladder })
    return { board: boardStr, n: set.n, requiredWords, count: r.count, longest: r.longest, score: r.score, tries }
  }
  return null
}
