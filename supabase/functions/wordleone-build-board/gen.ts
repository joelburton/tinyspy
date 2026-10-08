// cs-unmet

/**
 * Pure Wordle in 1 puzzle generation: a starter word, its colors against a
 * hidden answer, and the answer, chosen so that the answer is the only word in
 * the game's pool that makes those colors against the starter. No IO and
 * nothing Deno's or Node's, so the edge function (`index.ts`) and the
 * printable sheet (`supabase/scripts/wordleone/sheet.ts`) run the same code.
 *
 * The caller hands in every five-letter word with the columns the filters read
 * (`WordRow`) and a random source; `buildPuzzle` picks an answer from the
 * answer band and searches starters until one isolates it under the filters,
 * or answers null when no answer it tried has a puzzle in the tier.
 *
 * The shapes are the NYT's published rounds less the anagrams, read by Joel
 * (src/wordleone/doc.md → The NYT's rounds); the sheet and the ratings survey
 * are how they get tried.
 */

/** One five-letter row of `common.words`, the columns the filters read. */
export interface WordRow {
  word: string
  /** `band`, the 1–6 recognizability band. */
  band: number
  /** `wordle`: on the NYT answer list, which is where a band-0 answer comes from. */
  isAnswerList: boolean
  /** The must-reach filter: `slur = 0 and crude = 0 and american and not slang`. */
  isClean: boolean
  /** `root_word`, the lemma of an inflected form; null for a base word. */
  root: string | null
}

/** The tier a puzzle's colors fall in: the shape of its greens, yellows and grays. */
export type Tier = 'easy' | 'medium' | 'hard'
export type TierChoice = Tier | 'any'

export interface Puzzle {
  starter: string
  /** Five of `g` / `y` / `x`: the starter scored against the answer. */
  colors: string
  answer: string
  tier: Tier
  greens: number
  yellows: number
  /** Answer-list words (and the answer, when it is off the list) consistent with the greens and yellows alone. */
  positiveSpace: number
  /** Tiles the answer is NOT unique without — the ones doing work. */
  loadBearing: number
}

/**
 * The shapes a tier allows, as greens · yellows · grays (`shapeOf`). These are
 * the NYT's shapes less two kinds (Joel, 2026-10-07): every tile colored is an
 * anagram, not a deduction, and four greens is fill-in-the-blank. 0g4y1x is
 * near an anagram and stays for now, until players say.
 */
export const TIER_SHAPES: Record<Tier, readonly string[]> = {
  easy: ['3g0y2x', '3g1y1x'],
  medium: ['2g2y1x', '1g2y2x', '2g1y2x', '1g3y1x', '2g0y3x'],
  hard: ['0g3y2x', '0g4y1x'],
}

/**
 * What "any" means: a tier drawn first, one in four easy, one in two medium,
 * one in four hard, and then a puzzle searched for in that tier (Joel,
 * 2026-10-08). Taking the first starter that passed any tier gave seven medium
 * puzzles for every two easy and one hard — medium's shapes are the commonest
 * and the likeliest to isolate an answer.
 */
export const ANY_TIER_ODDS: ReadonlyArray<{ tier: Tier; share: number }> = [
  { tier: 'easy', share: 0.25 },
  { tier: 'medium', share: 0.5 },
  { tier: 'hard', share: 0.25 },
]

/** The tier "any" lands on, from one draw of `random`. */
export function drawTier(random: () => number): Tier {
  const roll = random()
  let edge = 0
  for (const { tier, share } of ANY_TIER_ODDS) {
    edge += share
    if (roll < edge) return tier
  }
  return ANY_TIER_ODDS[ANY_TIER_ODDS.length - 1]!.tier
}

/** The NYT's ceiling over its 35 published rounds. */
export const MAX_POSITIVE_SPACE = 4

/** A starter is an everyday word; the NYT's two off-list starters were band 2. */
export const STARTER_MAX_BAND = 2

/** Answer band 0 is not a band: it is the NYT answer list, every word of which is at band 2 or easier. */
export const ANSWER_LIST_BAND = 0

/** How far above the answer band the pool and the guess gate reach. */
const POOL_BANDS_ABOVE = 2
const MAX_BAND = 6

/**
 * The pool the answer is unique in, which is also the band a guess must be
 * in: two bands above the answer band, capped at 6, with the NYT list counting
 * as band 2 (Joel, 2026-10-07). A smaller pool keeps puzzles open; two above
 * keeps "not a word" rare for a word the player knows.
 * `wordleone._legal_band_for` is the same rule in SQL.
 */
export function poolBandFor(answerBand: number): number {
  const top = answerBand === ANSWER_LIST_BAND ? STARTER_MAX_BAND : answerBand
  return Math.min(MAX_BAND, top + POOL_BANDS_ABOVE)
}

/** Colors as a tier reads them: `0g3y2x`. */
export function shapeOf(colors: string): string {
  return `${countOf(colors, 'g')}g${countOf(colors, 'y')}y${countOf(colors, 'x')}x`
}

/** The tier whose shapes include these colors; null for a shape no tier takes. */
export function tierOf(colors: string): Tier | null {
  const shape = shapeOf(colors)
  for (const tier of ['easy', 'medium', 'hard'] as const) {
    if (TIER_SHAPES[tier].includes(shape)) return tier
  }
  return null
}

/**
 * Score `guess` against `answer`, Wordle-style: `g` right letter right spot,
 * `y` in the word elsewhere, `x` not in the word. A letter earns a yellow only
 * while the answer still has an unclaimed copy after the greens are taken —
 * the same rule as `common._wordle_colors`.
 */
export function colorsOf(guess: string, answer: string): string {
  const out = ['x', 'x', 'x', 'x', 'x']
  const unclaimed = new Map<string, number>()
  for (let i = 0; i < 5; i++) {
    if (guess[i] === answer[i]) out[i] = 'g'
    else unclaimed.set(answer[i], (unclaimed.get(answer[i]) ?? 0) + 1)
  }
  for (let i = 0; i < 5; i++) {
    if (out[i] === 'g') continue
    const left = unclaimed.get(guess[i]) ?? 0
    if (left > 0) {
      out[i] = 'y'
      unclaimed.set(guess[i], left - 1)
    }
  }
  return out.join('')
}

/** A plural inflection — `root_word` set to something else, and an `s` on the end. */
export function isPlural(row: WordRow): boolean {
  return row.root !== null && row.root !== row.word && row.word.endsWith('s')
}

function countOf(colors: string, code: string): number {
  let n = 0
  for (const c of colors) if (c === code) n++
  return n
}

const CODE_A = 97
const CODE_G = 103
const CODE_X = 120
const CODE_Y = 121

/** The letters in `word`, one bit each: `a` is bit 0. */
function maskOf(word: string): number {
  let mask = 0
  for (let i = 0; i < 5; i++) mask |= 1 << (word.charCodeAt(i) - CODE_A)
  return mask
}

/** A word with its letter mask, which rules most words out of a colors match before any scoring. */
interface Entry {
  word: string
  mask: number
}

/** The five positions, as a bitmask of which tiles a match compares. */
const ALL_TILES = 0b11111

// Scratch for `scoresAs`: a count per letter, reused so a scan over the pool allocates nothing.
const unclaimed = new Int8Array(26)

/**
 * Whether `word` scores `colors` against `starter` at every tile in `checked`
 * — `colorsOf`'s rule, leaving at the first tile that differs and building no
 * strings. An unchecked tile still claims its letter, as it does in `colorsOf`.
 */
function scoresAs(starter: string, word: string, colors: string, checked: number): boolean {
  unclaimed.fill(0)
  for (let i = 0; i < 5; i++) {
    const w = word.charCodeAt(i)
    const isChecked = (checked >> i) & 1
    if (starter.charCodeAt(i) === w) {
      if (isChecked && colors.charCodeAt(i) !== CODE_G) return false
    } else {
      if (isChecked && colors.charCodeAt(i) === CODE_G) return false
      unclaimed[w - CODE_A]++
    }
  }
  for (let i = 0; i < 5; i++) {
    const s = starter.charCodeAt(i)
    if (s === word.charCodeAt(i)) continue
    const isChecked = (checked >> i) & 1
    const left = unclaimed[s - CODE_A]
    if (left > 0) {
      unclaimed[s - CODE_A] = left - 1
      if (isChecked && colors.charCodeAt(i) !== CODE_Y) return false
    } else if (isChecked && colors.charCodeAt(i) !== CODE_X) return false
  }
  return true
}

/**
 * How many of `entries` score `colors` against `starter` at the tiles in
 * `checked`, stopping at `limit`. A letter colored at a checked tile must be
 * in the word, and a letter gray at every one of its tiles, all checked, must
 * not be; the masks settle both before `scoresAs` runs.
 */
function countConsistent(starter: string, colors: string, entries: readonly Entry[], checked: number, limit = Infinity): number {
  let required = 0
  let mayBePresent = 0
  let inStarter = 0
  for (let i = 0; i < 5; i++) {
    const bit = 1 << (starter.charCodeAt(i) - CODE_A)
    const isChecked = (checked >> i) & 1
    const isColored = colors.charCodeAt(i) !== CODE_X
    inStarter |= bit
    if (isChecked && isColored) required |= bit
    if (!isChecked || isColored) mayBePresent |= bit
  }
  const absent = inStarter & ~mayBePresent
  let n = 0
  for (const e of entries) {
    if ((e.mask & required) !== required || (e.mask & absent) !== 0) continue
    if (scoresAs(starter, e.word, colors, checked) && ++n >= limit) break
  }
  return n
}

/** Fisher–Yates over a copy, drawing from `random`. */
function shuffled<T>(items: readonly T[], random: () => number): T[] {
  const out = [...items]
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1))
    ;[out[i], out[j]] = [out[j], out[i]]
  }
  return out
}

export interface BuildOptions {
  /** The answer band: 0 the NYT answer list, 1–6 any clean non-plural word at or below. The pool follows it (`poolBandFor`). */
  answerBand: number
  tier: TierChoice
  /** `Math.random`, or a seeded source for a reproducible puzzle. */
  random: () => number
  /** How many answers to try before giving up (each is a full pass over the starters). */
  maxAnswers?: number
  /**
   * The sheet's sampling rule: the answer sits AT the band, not at or below
   * it, so a card marked band 6 shows what a band-6 answer feels like. Off by
   * default: the game draws at or below.
   */
  answerAtBand?: boolean
}

/** Answers are tried until one has a puzzle; at a few milliseconds a try, a hundred refuses about one request in a million. */
const DEFAULT_MAX_ANSWERS = 100

/**
 * Build one puzzle. The tier is the one asked for, or drawn first under "any"
 * (`drawTier`). The answer is a random word of the answer band — a clean word
 * on the NYT answer list at band 0, any clean non-plural word at or below the
 * band otherwise (or, under `answerAtBand`, at exactly it); the starter is any
 * clean non-plural word at band ≤ 2 that scores against the answer in one of
 * the tier's shapes, isolates it among every word in the pool, and leaves at
 * most four answer-list words consistent with its greens and yellows alone.
 */
export function buildPuzzle(words: readonly WordRow[], opts: BuildOptions): Puzzle | null {
  const { answerBand, random } = opts
  const tier = opts.tier === 'any' ? drawTier(random) : opts.tier
  const entryOf = (r: WordRow): Entry => ({ word: r.word, mask: maskOf(r.word) })
  const pool = words.filter((r) => r.band <= poolBandFor(answerBand)).map(entryOf)
  const answerList = words.filter((r) => r.isAnswerList && r.isClean).map(entryOf)
  const answers = answerBand === ANSWER_LIST_BAND
    ? answerList.map((e) => e.word)
    : words
      .filter((r) => r.isClean && !isPlural(r) && (opts.answerAtBand ? r.band === answerBand : r.band <= answerBand))
      .map((r) => r.word)
  const starters = words.filter((r) => r.isClean && r.band <= STARTER_MAX_BAND && !isPlural(r)).map((r) => r.word)
  if (answers.length === 0 || starters.length === 0) return null

  const shapes = new Set(TIER_SHAPES[tier])
  for (const answer of shuffled(answers, random).slice(0, opts.maxAnswers ?? DEFAULT_MAX_ANSWERS)) {
    // Positive space always counts the answer itself, so an off-list answer's number compares with a listed one's.
    const positiveList = answerList.some((e) => e.word === answer) ? answerList : [...answerList, { word: answer, mask: maskOf(answer) }]
    for (const starter of shuffled(starters, random)) {
      if (starter === answer) continue
      const colors = colorsOf(starter, answer)
      if (!shapes.has(shapeOf(colors))) continue

      // Unique in the pool: the answer is the only legal word making these colors.
      if (countConsistent(starter, colors, pool, ALL_TILES, 2) > 1) continue

      let coloredTiles = 0
      for (let i = 0; i < 5; i++) if (colors[i] !== 'x') coloredTiles |= 1 << i
      const positiveSpace = countConsistent(starter, colors, positiveList, coloredTiles)
      if (positiveSpace > MAX_POSITIVE_SPACE) continue

      let loadBearing = 0
      for (let hidden = 0; hidden < 5; hidden++) {
        if (countConsistent(starter, colors, pool, ALL_TILES & ~(1 << hidden), 2) > 1) loadBearing++
      }
      return {
        starter,
        colors,
        answer,
        tier,
        greens: countOf(colors, 'g'),
        yellows: countOf(colors, 'y'),
        positiveSpace,
        loadBearing,
      }
    }
  }
  return null
}
