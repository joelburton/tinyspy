// cs-unmet

/**
 * scrabble AI player — the move-selection *policy* (docs/games/scrabble.md).
 *
 * The move suggester (suggest.ts + rank.ts) always plays at full strength: it
 * finds every legal move and recommends the best. An autonomous *opponent*
 * wants the opposite knob — the ability to play *worse*, at a chosen level, in
 * ways that feel like a weaker human rather than a lobotomised engine. This
 * module is that brain, kept deliberately separate from (and on top of) the
 * suggester engine:
 *
 *   - `choosePlay` — given a board + rack + a `GStrengthKnobs` config, pick ONE
 *     move (or an exchange). This is the reusable AI-player decision; the
 *     eventual server/edge opponent calls exactly this. It is PURE and
 *     deterministic given its `rng`.
 *   - `playSelfGame` — drive a whole coop game (one shared rack, maximize total
 *     score) to completion with a given level, returning the final score plus
 *     diagnostics. This is the measurement harness's per-game unit; the CLI
 *     (`supabase/scripts/scrabble-selfplay.ts`) runs it over many paired seeds.
 *
 * A "level" is just a bag of knob values — see `LEVELS`. The knobs and their
 * initial settings are HYPOTHESES to be tuned by the self-play experiment
 * (docs/games/scrabble.md), not final tuning.
 *
 * `.ts` import extensions throughout: like play.ts / suggest.ts / rank.ts this
 * module is written to also load under Deno (the future opponent edge function),
 * whose whole transitive import graph needs explicit extensions.
 */

import { RACK_SIZE, cellIndex, fullBag, makeCellId, makeEmptyBoard } from './board.ts'
import { tilesUsed } from './play.ts'
import { generateMoves } from './suggest.ts'
import { leaveValue, rankMoves } from './rank.ts'
import type {
  GAiLevel, GBands, GCell, GFormedWord, GGameResult, GPlacement, GRankedMove, GStrengthKnobs,
} from '../types.ts'
// Relative, not `@/`: this module is on the Deno import graph
// (scrabble-ai-move → here) and Deno cannot resolve the alias.
import { walkWord, type Trie } from '../../shared/dict-trie/trie.ts'
import { mulberry32 } from '../../common/utils/mulberry32.ts'

// ── The strength knobs ──────────────────────────────────────────────────────

/** The five shipped levels, weakest → strongest. `best` is the current
 *  full-strength suggester behavior (all knobs off). Tuned by the self-play
 *  sweep (docs/games/scrabble.md) to an evenly-spaced mean-score ladder
 *  — ≈455 / 580 / 715 / 840 / 912 points per coop game (N=40). Retuning means
 *  re-running the sweep, deliberately. */
export const LEVEL_NAMES: readonly GAiLevel[] = [
  'beginner', 'casual', 'intermediate', 'strong', 'best',
]
export const LEVELS: Record<GAiLevel, GStrengthKnobs> = {
  beginner:     { vocabCap: 1, useLeave: false, bingoMissProb: 0.9, equityNoise: 30 },
  casual:       { vocabCap: 2, useLeave: false, bingoMissProb: 0.4, equityNoise: 10 },
  intermediate: { vocabCap: 4, useLeave: true,  bingoMissProb: 0.3, equityNoise: 10 },
  strong:       { useLeave: true,  bingoMissProb: 0.1, equityNoise: 8 },
  best:         { useLeave: true,  bingoMissProb: 0,   equityNoise: 0 },
}

// ── Choosing one move ───────────────────────────────────────────────────────

/** What the policy decides to do on a turn. `exchange` carries the tiles to
 *  dump (currently the whole rack — see the "no strategic exchange" note in
 *  docs/games/scrabble.md); the caller checks bag feasibility. */
type PlayChoice =
  | { kind: 'word'; placements: GPlacement[]; words: GFormedWord[]; score: number; bingo: boolean }
  | { kind: 'exchange'; tiles: string[] }

/** Word-difficulty lookup over the rated trie (a word missing from the trie —
 *  impossible for a generated move — reads as harder than any cap). The exact
 *  predicate the edge function uses. */
function makeWordDifficulty(trie: Trie): (word: string) => number {
  return (word: string) => {
    const node = walkWord(trie, word)
    return node > 0 ? trie.eow[node] : 7
  }
}

/** A standard-normal sample from a uniform `rng` (Box–Muller). */
function gaussian(rng: () => number): number {
  const u1 = Math.max(rng(), 1e-12) // avoid log(0)
  const u2 = rng()
  return Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * u2)
}

/** A play is a bingo when it lays a full rack (the +50 condition in play.ts). */
const isBingo = (m: GRankedMove) => m.placements.length === RACK_SIZE

/**
 * Pick one move for the given strength level. Pure + deterministic given `rng`.
 *
 * Pipeline: generate every legal move (against the game's `bands`) → rank under
 * the ranking knobs (`vocabCap` / `scoreFraction` / `useLeave`) → perturb each
 * candidate's equity by `equityNoise` and take the argmax → optionally "miss" a
 * bingo. If nothing is playable (no moves, or `vocabCap` filtered them all),
 * ask to exchange the whole rack.
 */
export function choosePlay(
  board: GCell[],
  rack: readonly string[],
  trie: Trie,
  bands: GBands,
  knobs: GStrengthKnobs,
  rng: () => number,
): PlayChoice {
  const moves = generateMoves(board, rack, trie, bands)
  const ranked = rankMoves(board, moves, rack, makeWordDifficulty(trie), {
    vocabCap: knobs.vocabCap,
    scoreFraction: knobs.scoreFraction,
    useLeave: knobs.useLeave,
    topN: moves.length, // the FULL ranked list; we make our own final pick below
  })
  if (ranked.length === 0) return { kind: 'exchange', tiles: [...rack] }

  // Seeded Gaussian jitter on equity → the AI doesn't reliably find its best.
  const jittered = ranked
    .map((m) => ({ m, key: m.equity + (knobs.equityNoise > 0 ? gaussian(rng) * knobs.equityNoise : 0) }))
    .sort((a, b) => b.key - a.key)

  let pick = jittered[0].m
  if (isBingo(pick) && knobs.bingoMissProb > 0 && rng() < knobs.bingoMissProb) {
    const alt = jittered.find((j) => !isBingo(j.m))
    if (alt) pick = alt.m
  }
  return { kind: 'word', placements: pick.placements, words: pick.words, score: pick.score, bingo: isBingo(pick) }
}

// ── Playing a whole coop game ────────────────────────────────────────────────

/** Exchange needs at least a full rack left in the bag (standard rule). */
const EXCHANGE_MIN_BAG = RACK_SIZE
/** End the game after this many consecutive non-scoring (exchange) turns — a
 *  hopeless rack that even swapping can't rescue, and a guard against an
 *  exchange ping-pong that never terminates while the bag has tiles.
 *
 *  This is the SELF-PLAY HARNESS's own stopping rule, not the game's: a real
 *  game ends when every active seat passes in a row (scrabble._commit_pass),
 *  which a solo simulation with no opponents can't express. Tuning numbers are
 *  comparable across strength levels because every level stops the same way. */
const MAX_SCORELESS = 3

/** Seeded Fisher–Yates. */
function shuffle<T>(arr: readonly T[], rng: () => number): T[] {
  const a = [...arr]
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1))
    ;[a[i], a[j]] = [a[j], a[i]]
  }
  return a
}

/**
 * Self-play a coop game to completion and report the result. Fully
 * deterministic given `(knobs, bagSeed)`: the bag shuffle comes from `bagSeed`,
 * and each turn's stochastic policy RNG is derived from `bagSeed + turnIndex`.
 * So the SAME `bagSeed` across different levels gives an identical bag and
 * identical per-turn seeds — only the policy differs. That is the paired /
 * common-random-numbers design the measurement plan relies on.
 *
 * Bag model: a fixed shuffled queue; draws take from the front, an exchange
 * returns the rack to the back and draws fresh. Deterministic and reproducible
 * (not a physical re-shuffle, but a faithful enough model — exchanges are rare).
 */
export function playSelfGame(trie: Trie, bands: GBands, knobs: GStrengthKnobs, bagSeed: number): GGameResult {
  const bag = shuffle(fullBag(), mulberry32(bagSeed))
  let rack = bag.splice(0, RACK_SIZE)
  const board = makeEmptyBoard()

  let score = 0
  let turns = 0
  let bingos = 0
  let exchanges = 0
  let scorelessStreak = 0
  const turnScores: number[] = []
  const leaveTrajectory: number[] = []

  for (;;) {
    // Per-turn RNG: reproducible, distinct per turn, independent of the bag draw.
    const turnRng = mulberry32((bagSeed ^ 0x9e3779b9) + turns * 0x85ebca6b)
    const choice = choosePlay(board, rack, trie, bands, knobs, turnRng)

    if (choice.kind === 'word') {
      for (const p of choice.placements) {
        const id = makeCellId(p.x, p.y)
        board[cellIndex(p.x, p.y)] = { id, tile: { id, letter: p.letter, blank: p.blank } }
      }
      score += choice.score
      turnScores.push(choice.score)
      if (choice.bingo) bingos++
      for (const t of tilesUsed(choice.placements)) rack.splice(rack.indexOf(t), 1)
      rack.push(...bag.splice(0, RACK_SIZE - rack.length))
      scorelessStreak = 0
      turns++
      leaveTrajectory.push(leaveValue(rack))
    } else {
      // No playable word. Exchange the whole rack if the bag can afford it, else
      // the game is over (can't play, can't swap) — that stuck attempt is not a turn.
      if (bag.length < EXCHANGE_MIN_BAG) break
      bag.push(...rack)
      rack = bag.splice(0, RACK_SIZE)
      exchanges++
      scorelessStreak++
      turns++
      leaveTrajectory.push(leaveValue(rack))
      if (scorelessStreak >= MAX_SCORELESS) break
    }
  }

  return { score, turns, bingos, exchanges, tilesLeft: rack.length + bag.length, turnScores, leaveTrajectory }
}
