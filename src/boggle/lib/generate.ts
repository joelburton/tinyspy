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

/** Roll + solve until a board meets every constraint, or `null` if it can't (the
 *  caller should relax the constraints and tell the player).
 *
 *  Two bounds: `maxTries` (a deterministic count — what tests use) and the
 *  optional `maxMs` (a wall-clock budget). The edge function passes `maxMs`
 *  because its worker has a CPU ceiling: an impossible constraint would otherwise
 *  busy-loop to `maxTries` and get the worker killed instead of returning null.
 *  Leaving `maxMs` undefined skips all clock reads, so tests stay pure. */
export function generateBoard(
  trie: Trie,
  set: DiceSet,
  constraints: BoardConstraints,
  seed: number,
  maxTries = 200_000,
  maxMs?: number,
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

  const startMs = maxMs !== undefined ? performance.now() : 0
  for (let tries = 1; tries <= maxTries; tries++) {
    // Wall-clock budget (edge only): check occasionally to bound the busy loop
    // without paying a clock read every iteration.
    if (maxMs !== undefined && (tries & 1023) === 0 && performance.now() - startMs > maxMs) break
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

/**
 * Enumerate a finished board's BONUS words: every word the *legal*-band trie can
 * trace on the board that isn't already required. Points use the same ladder +
 * min length as the required list, so a bonus word scores exactly what the old
 * server-side `common.words` path computed at guess time.
 *
 * This runs ONCE, on an already-accepted board — it is deliberately NOT part of
 * `generateBoard`'s roll→solve→reject loop, because board-creation constraints are
 * judged on the *required* set only (see `docs/games/boggle.md`). Shipping the
 * bonus list to the FE is what lets the client validate + score bonus guesses
 * locally (no `common.words` round-trip); when `legalTrie` covers the same band as
 * the required trie the result is empty.
 */
export function listBonusWords(
  legalTrie: Trie,
  boardStr: string,
  requiredWords: FoundWord[],
  opts: { minWordLength?: number; ladder?: LadderName },
): FoundWord[] {
  const required = new Set(requiredWords.map((w) => w.word))
  return listWords(legalTrie, parseBoard(boardStr), opts).filter((w) => !required.has(w.word))
}
