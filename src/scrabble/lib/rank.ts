/**
 * Scrabble move suggester — ranking (docs/scrabble-ai.md S3).
 *
 * The generator (suggest.ts) finds every legal move; this module decides
 * which ones to recommend. The model is first-order Maven (Sheppard 2002):
 * a move's worth — its *equity* — is
 *
 *     points scored now  +  heuristic value of the rack you keep (the LEAVE)
 *
 * Scoring reuses `evaluatePlay` verbatim, so a suggestion's score can't
 * disagree with what the game will actually award; `evaluatePlay`'s geometry
 * gate also acts as an internal assertion on the generator (an invalid move
 * here is a bug, and throws rather than being quietly dropped).
 *
 * The leave heuristic is hand-rolled — the "strong club player, not Maven"
 * target (see the plan's ranking-tier survey). All weights are named
 * constants: they ARE the tunable surface, in points of expected future
 * score. One deliberate simplification, worth stating: leave value is a
 * future-turns quantity, so it overweights late in the game — when the bag
 * is empty the truth is closer to "unplayed tiles are pure liability". The
 * good-not-expert target says ignore that; it's a known bias, not modeled.
 */

import { BLANK, type Cell } from './board.ts'
import { evaluatePlay, tilesUsed, type FormedWord, type Placement } from './play.ts'

export type RankOptions = {
  topN?: number           // default 5
  vocabCap?: number       // strength lever 1: only *play* words with difficulty <= cap
  scoreFraction?: number  // strength lever 2: target this fraction of the best equity
  useLeave?: boolean      // strength lever 3: default true
}

export type RankedMove = {
  placements: Placement[]
  words: FormedWord[]   // from evaluatePlay — what the FE displays
  score: number         // what the game will actually award (incl. bingo)
  leave: number         // heuristic equity of the tiles kept
  equity: number        // score + leave — the sort key
}

// --- The leave weights (points of expected future score) -------------------

/** Per-tile residual values. Blank +24: its worth is option value — it
 *  converts near-bingos into bingos. S +8: the premier hook tile. Z/X carry
 *  real face value flexibly; E and the flexible workers (R N T L A H) are
 *  small positives; the clunkers go negative — and Q −8, because Q's face
 *  value flatters a tile that regularly strands a turn. Unlisted letters
 *  are 0. */
const LEAVE_TILE: Record<string, number> = {
  [BLANK]: 24,
  S: 8,
  Z: 4, X: 3,
  E: 2,
  R: 1, N: 1, T: 1, L: 1, A: 1, H: 1,
  G: -1, J: -2, U: -2, W: -2, V: -3,
  Q: -8,
}

/** Each S beyond the first is worth this instead of the full 8 — hooks don't
 *  stack (one S already pluralizes whatever needs pluralizing). This IS the
 *  S's diminishing-returns rule, so S is excluded from LEAVE_DUP below. */
const LEAVE_EXTRA_S = 3

/** Holding Q with no U and no blank (on top of Q's base −8): the stranded-Q
 *  tax. A U or a blank in the leave is the escape hatch. */
const LEAVE_Q_NO_U = -4

/** Per copy beyond the first, per letter: duplicate tiles overlap in the
 *  words they enable. (S has its own rule above; blanks are wildcards and
 *  don't overlap each other the way duplicate letters do — both excluded.) */
const LEAVE_DUP = -2.5

/** Per unit of `abs(vowels − consonants)` beyond 1, blanks counting as
 *  neither (and Y counting as a consonant): a 6-consonant leave and a
 *  5-vowel leave are both stuck racks. */
const LEAVE_IMBALANCE = -1.5

const VOWELS = new Set(['A', 'E', 'I', 'O', 'U'])

/** Heuristic equity of a kept rack (glyphs `'A'..'Z'` / `'?'`), in points of
 *  expected future score. Exported for tests and for the deferred
 *  exchange-suggestion feature (which tiles to dump = the same arithmetic). */
export function leaveValue(tiles: readonly string[]): number {
  const counts = new Map<string, number>()
  for (const t of tiles) counts.set(t, (counts.get(t) ?? 0) + 1)

  let value = 0
  let vowels = 0
  let consonants = 0
  for (const [glyph, n] of counts) {
    if (glyph === 'S') {
      value += LEAVE_TILE.S + LEAVE_EXTRA_S * (n - 1)
    } else {
      value += (LEAVE_TILE[glyph] ?? 0) * n
      if (glyph !== BLANK) value += LEAVE_DUP * (n - 1)
    }
    if (glyph !== BLANK) {
      if (VOWELS.has(glyph)) vowels += n
      else consonants += n
    }
  }
  if ((counts.get('Q') ?? 0) > 0 && !counts.has('U') && !counts.has(BLANK))
    value += LEAVE_Q_NO_U
  value += LEAVE_IMBALANCE * Math.max(0, Math.abs(vowels - consonants) - 1)
  return value
}

// --- Ranking ----------------------------------------------------------------

/**
 * Score every candidate, add the leave, return the sorted top N.
 *
 * `wordDifficulty` is a trie lookup (the edge function builds it) — only
 * consulted when `vocabCap` is set, which drops any move whose formed words
 * include one above the cap. That's strength lever 1, the most human-feeling
 * nerf: a weak bot that still drops QOPH on a triple feels wrong; a bot that
 * knows fewer words loses the way a real friend loses.
 *
 * `scoreFraction` (lever 2) re-aims the list: instead of best-first, moves
 * are ordered by closeness to `fraction × best equity` (ties broken toward
 * the higher-equity move). 1.0 → best play; ~0.6 → gentle. The plan's
 * pick-the-Nth-best alternative was rejected — rank is a noisy proxy.
 *
 * `useLeave: false` (lever 3) drops the leave term. S5 ships max strength
 * only (all levers at their defaults); the signature is ready for the
 * strength slider.
 */
export function rankMoves(
  board: Cell[], moves: Placement[][], rack: readonly string[],
  wordDifficulty: (word: string) => number,
  opts: RankOptions = {},
): RankedMove[] {
  const { topN = 5, vocabCap, scoreFraction, useLeave = true } = opts

  const rackCounts = new Map<string, number>()
  for (const g of rack) rackCounts.set(g, (rackCounts.get(g) ?? 0) + 1)

  const ranked: RankedMove[] = []
  for (const placements of moves) {
    const ev = evaluatePlay(board, placements)
    if (!ev.valid)
      // The generator only emits geometrically legal moves — this is a bug,
      // and a wrong suggestion is worse than a failed one. Fail loudly.
      throw new Error(`rankMoves: generator emitted an invalid play: ${ev.error}`)
    if (vocabCap !== undefined && ev.words.some((w) => wordDifficulty(w.word) > vocabCap))
      continue

    let leave = 0
    if (useLeave) {
      const kept = new Map(rackCounts)
      for (const t of tilesUsed(placements)) kept.set(t, (kept.get(t) ?? 0) - 1)
      const keptTiles: string[] = []
      for (const [glyph, n] of kept) for (let i = 0; i < n; i++) keptTiles.push(glyph)
      leave = leaveValue(keptTiles)
    }
    ranked.push({
      placements,
      words: ev.words,
      score: ev.score,
      leave,
      equity: ev.score + leave,
    })
  }

  ranked.sort((a, b) => b.equity - a.equity || b.score - a.score)
  if (scoreFraction !== undefined && ranked.length > 0) {
    const target = scoreFraction * ranked[0].equity
    ranked.sort(
      (a, b) =>
        Math.abs(a.equity - target) - Math.abs(b.equity - target) || b.equity - a.equity,
    )
  }

  // Presentation dedup (docs/scrabble-ai.md fixes §1). The generator keeps an
  // opening play's across form and its vertical transpose as distinct moves
  // (S2 point 6 — correct for generation), and positional shifts of the same
  // word often score identically too — so the sorted head can hold several
  // rows a player reads as one suggestion (same formed words, same score).
  // Collapse those for DISPLAY, keeping the first (best-ranked) of each key,
  // and keep filling until `topN` DISTINCT rows (or the list runs out). The
  // returned move list is presentation-trimmed; generation stays exhaustive.
  const seen = new Set<string>()
  const distinct: RankedMove[] = []
  for (const m of ranked) {
    const key = [...m.words.map((w) => w.word)].sort().join(',') + `|${m.score}`
    if (seen.has(key)) continue
    seen.add(key)
    distinct.push(m)
    if (distinct.length >= topN) break
  }
  return distinct
}
