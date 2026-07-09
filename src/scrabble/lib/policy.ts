/**
 * scrabble AI player — the move-selection *policy* (docs/scrabble-ai-strength.md).
 *
 * The move suggester (suggest.ts + rank.ts) always plays at full strength: it
 * finds every legal move and recommends the best. An autonomous *opponent*
 * wants the opposite knob — the ability to play *worse*, at a chosen level, in
 * ways that feel like a weaker human rather than a lobotomised engine. This
 * module is that brain, kept deliberately separate from (and on top of) the
 * suggester engine:
 *
 *   - `choosePlay` — given a board + rack + a `StrengthKnobs` config, pick ONE
 *     move (or an exchange). This is the reusable AI-player decision; the
 *     eventual server/edge opponent calls exactly this. It is PURE and
 *     deterministic given its `rng`.
 *   - `playSelfGame` — drive a whole coop game (one shared rack, maximise total
 *     score) to completion with a given level, returning the final score plus
 *     diagnostics. This is the measurement harness's per-game unit; the CLI
 *     (`supabase/scripts/scrabble-selfplay.ts`) runs it over many paired seeds.
 *
 * A "level" is just a bag of knob values — see `LEVELS`. The knobs and their
 * initial settings are HYPOTHESES to be tuned by the self-play experiment
 * (docs/scrabble-ai-strength.md), not final tuning.
 *
 * `.ts` import extensions throughout: like play.ts / suggest.ts / rank.ts this
 * module is written to also load under Deno (the future opponent edge function),
 * whose whole transitive import graph needs explicit extensions.
 */

import { BOARD_SIZE, RACK_SIZE, cellIndex, fullBag, type Cell } from './board.ts'
import { tilesUsed, type FormedWord, type Placement } from './play.ts'
import { generateMoves, type Bands } from './suggest.ts'
import { leaveValue, rankMoves, type RankedMove } from './rank.ts'
import { walkWord, type Trie } from '../../common/lib/game/trie.ts'
import { mulberry32 } from '../../common/lib/util/mulberry32.ts'

// ── The strength knobs ──────────────────────────────────────────────────────

/**
 * The levers that make the AI play worse. Each is independent; a level is a
 * specific combination (see `LEVELS`). Three reuse the ranking levers already
 * plumbed through `rankMoves`; two (`bingoMissProb`, `equityNoise`) model human
 * *fallibility* — not seeing the best move — which the deterministic levers
 * can't.
 */
export type StrengthKnobs = {
  /** The AI only PLAYS words whose difficulty ≤ cap (1..6); `undefined` = full
   *  vocabulary. The most human-feeling nerf — a weaker player simply knows
   *  fewer words. Applied as `rankMoves`' `vocabCap` filter, so the *game's*
   *  legal dictionary (the generation bands) stays constant across levels —
   *  only the AI's willingness to play a word changes. */
  vocabCap?: number
  /** Aim the pick at this fraction of the best equity instead of the max
   *  (`rankMoves`' re-aim lever); `undefined` = take the best. */
  scoreFraction?: number
  /** Include the leave heuristic when ranking (kept-rack quality). Off → a pure
   *  greedy scorer whose rack slowly degrades — the effect only shows up over a
   *  whole game, which is why the harness measures games, not turns. */
  useLeave: boolean
  /** Probability of "not seeing" an otherwise-chosen bingo and falling back to
   *  the best non-bingo. 0 = always plays its bingos; ~0.9 = a beginner who
   *  lands maybe 1–2 in 10 games. Anagramming a full rack is genuinely hard, so
   *  a probability reads more human than a hard "never bingo" ban. */
  bingoMissProb: number
  /** Std-dev of Gaussian noise added to each move's equity before the final
   *  argmax — models a player who doesn't reliably *find* the best move. 0 =
   *  deterministic (picks the true best). */
  equityNoise: number
}

/** The five shipped levels, weakest → strongest. `best` is the current
 *  full-strength suggester behaviour (all knobs off). Tuned by the self-play
 *  sweep (docs/scrabble-ai-strength.md) to an evenly-spaced mean-score ladder
 *  — ≈455 / 580 / 715 / 840 / 912 points per coop game (N=40). Retuning means
 *  re-running the sweep, deliberately. */
export type LevelName = 'beginner' | 'casual' | 'intermediate' | 'strong' | 'best'
export const LEVEL_NAMES: readonly LevelName[] = [
  'beginner', 'casual', 'intermediate', 'strong', 'best',
]
export const LEVELS: Record<LevelName, StrengthKnobs> = {
  beginner:     { vocabCap: 1, useLeave: false, bingoMissProb: 0.9, equityNoise: 30 },
  casual:       { vocabCap: 2, useLeave: false, bingoMissProb: 0.4, equityNoise: 10 },
  intermediate: { vocabCap: 4, useLeave: true,  bingoMissProb: 0.3, equityNoise: 10 },
  strong:       { useLeave: true,  bingoMissProb: 0.1, equityNoise: 8 },
  best:         { useLeave: true,  bingoMissProb: 0,   equityNoise: 0 },
}

// ── Choosing one move ───────────────────────────────────────────────────────

/** What the policy decides to do on a turn. `exchange` carries the tiles to
 *  dump (currently the whole rack — see the "no strategic exchange" note in
 *  docs/scrabble-ai-strength.md); the caller checks bag feasibility. */
export type PlayChoice =
  | { kind: 'word'; placements: Placement[]; words: FormedWord[]; score: number; bingo: boolean }
  | { kind: 'exchange'; tiles: string[] }

/** Word-difficulty lookup over the rated trie (a word missing from the trie —
 *  impossible for a generated move — reads as harder than any cap). The exact
 *  predicate the edge function uses. */
function makeWordDifficulty(trie: Trie): (word: string) => number {
  return (word: string) => {
    const node = walkWord(trie, word.toLowerCase())
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
const isBingo = (m: RankedMove) => m.placements.length === RACK_SIZE

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
  board: Cell[],
  rack: readonly string[],
  trie: Trie,
  bands: Bands,
  knobs: StrengthKnobs,
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

/** One self-played coop game's outcome — the final score plus the diagnostics
 *  the measurement plan reads (docs/scrabble-ai-strength.md). */
export type GameResult = {
  /** Accumulated word score — the primary metric (no leftover penalty; §decision 1). */
  score: number
  turns: number
  bingos: number
  exchanges: number
  /** Tiles never played (rack + bag at the end). */
  tilesLeft: number
  /** Per-word-play score, in order — the turn-score profile. */
  turnScores: number[]
  /** `leaveValue` of the rack kept after each non-terminal turn — the
   *  rack-quality trajectory that exposes the no-leave degradation mechanism. */
  leaveTrajectory: number[]
}

/** Exchange needs at least a full rack left in the bag (standard rule). */
const EXCHANGE_MIN_BAG = RACK_SIZE
/** End the game after this many consecutive non-scoring (exchange) turns — a
 *  hopeless rack that even swapping can't rescue, and a guard against an
 *  exchange ping-pong that never terminates while the bag has tiles. */
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
export function playSelfGame(trie: Trie, bands: Bands, knobs: StrengthKnobs, bagSeed: number): GameResult {
  const bag = shuffle(fullBag(), mulberry32(bagSeed))
  let rack = bag.splice(0, RACK_SIZE)
  const board: Cell[] = new Array<Cell>(BOARD_SIZE * BOARD_SIZE).fill(null)

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
      for (const p of choice.placements) board[cellIndex(p.x, p.y)] = { l: p.letter, b: p.blank }
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
