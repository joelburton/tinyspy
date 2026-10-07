// cs-unmet

/**
 * Pure Wordle in 1 puzzle generation: a starter word, its colors against a
 * hidden answer, and the answer, chosen so that the answer is the only word at
 * or below the game's band that makes those colors against the starter. No IO
 * and nothing Deno's or Node's, so the edge function (`index.ts`) and the
 * printable sheet (`supabase/scripts/wordleone/sheet.ts`) run the same code.
 *
 * The caller hands in every five-letter word with the columns the filters read
 * (`WordRow`) and a random source; `buildPuzzle` picks an answer and searches
 * starters until one isolates it under the filters, or answers null when no
 * answer it tried has a puzzle in the tier.
 *
 * The filters are the plan's reading of the NYT's published rounds, not a
 * calibration; the sheet is how they get tried.
 */

/** One five-letter row of `common.words`, the columns the filters read. */
export interface WordRow {
  word: string
  /** `band`, the 1–6 recognizability band. */
  band: number
  /** `wordle`: on the NYT answer list, which is where every answer comes from. */
  isAnswerList: boolean
  /** The must-reach filter: `slur = 0 and crude = 0 and american and not slang`. */
  isClean: boolean
  /** `root_word`, the lemma of an inflected form; null for a base word. */
  root: string | null
}

/** The shape of the colors, by how many greens anchor the answer. */
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

/** Greens per tier: anchor on three, place around one or two, or place every letter. */
export const TIER_GREENS: Record<Tier, readonly number[]> = { easy: [3], medium: [1, 2], hard: [0] }

/** Four greens is fill-in-the-blank; the NYT never publishes one. */
export const MAX_GREENS = 3

/** The NYT's ceiling over its 35 published rounds. */
export const MAX_POSITIVE_SPACE = 4

/** A starter is an everyday word; the NYT's two off-list starters were band 2. */
export const STARTER_MAX_BAND = 2

/** The tier a green count falls in; null for a count no tier takes. */
export function tierOf(greens: number): Tier | null {
  for (const tier of ['easy', 'medium', 'hard'] as const) {
    if (TIER_GREENS[tier].includes(greens)) return tier
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

/** How many of `words` agree with `colors` at `positions` when scored against `starter`. */
function countConsistent(starter: string, colors: string, words: readonly string[], positions: readonly number[]): number {
  let n = 0
  for (const w of words) {
    const c = colorsOf(starter, w)
    let agrees = true
    for (const i of positions) {
      if (c[i] !== colors[i]) {
        agrees = false
        break
      }
    }
    if (agrees) n++
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
  /** The legal band: the pool the answer is unique in, and the words a player may guess. */
  band: number
  tier: TierChoice
  /** `Math.random`, or a seeded source for a reproducible puzzle. */
  random: () => number
  /** How many answers to try before giving up (each is a full pass over the starters). */
  maxAnswers?: number
  /**
   * The sheet's sampling rule: the answer sits AT the band, not at or below it,
   * and is any clean non-plural word rather than one on the NYT answer list,
   * which has no word above band 2. A card marked band 6 then shows what a
   * band-6 answer feels like. Off by default: the game draws from the list.
   */
  answerAtBand?: boolean
}

/**
 * Build one puzzle. The answer is a random clean word on the NYT answer list
 * at or below the band (or, under `answerAtBand`, any clean non-plural word at
 * exactly the band); the starter is any clean non-plural word at band ≤ 2
 * that scores against the answer with the tier's green count, isolates it
 * among every word at or below the band, and leaves at most four answer-list
 * words consistent with its greens and yellows alone.
 */
export function buildPuzzle(words: readonly WordRow[], opts: BuildOptions): Puzzle | null {
  const { band, tier, random } = opts
  const pool = words.filter((r) => r.band <= band).map((r) => r.word)
  const answerList = words.filter((r) => r.isAnswerList && r.isClean).map((r) => r.word)
  const answers = opts.answerAtBand
    ? words.filter((r) => r.isClean && !isPlural(r) && r.band === band).map((r) => r.word)
    : words.filter((r) => r.isAnswerList && r.isClean && r.band <= band).map((r) => r.word)
  const starters = words.filter((r) => r.isClean && r.band <= STARTER_MAX_BAND && !isPlural(r)).map((r) => r.word)
  if (answers.length === 0 || starters.length === 0) return null

  const ALL = [0, 1, 2, 3, 4]
  for (const answer of shuffled(answers, random).slice(0, opts.maxAnswers ?? 25)) {
    // Positive space always counts the answer itself, so an off-list answer's number compares with a listed one's.
    const positiveList = answerList.includes(answer) ? answerList : [...answerList, answer]
    for (const starter of shuffled(starters, random)) {
      if (starter === answer) continue
      const colors = colorsOf(starter, answer)
      const greens = countOf(colors, 'g')
      if (greens > MAX_GREENS) continue
      const puzzleTier = tierOf(greens)
      if (puzzleTier === null || (tier !== 'any' && puzzleTier !== tier)) continue

      // Unique in the pool: no other legal word makes these colors.
      let isUnique = true
      for (const w of pool) {
        if (w !== answer && colorsOf(starter, w) === colors) {
          isUnique = false
          break
        }
      }
      if (!isUnique) continue

      const colored = ALL.filter((i) => colors[i] !== 'x')
      const positiveSpace = colored.length === 0 ? positiveList.length : countConsistent(starter, colors, positiveList, colored)
      if (positiveSpace > MAX_POSITIVE_SPACE) continue

      let loadBearing = 0
      for (const hidden of ALL) {
        const without = ALL.filter((i) => i !== hidden)
        if (countConsistent(starter, colors, pool, without) > 1) loadBearing++
      }
      return { starter, colors, answer, tier: puzzleTier, greens, yellows: countOf(colors, 'y'), positiveSpace, loadBearing }
    }
  }
  return null
}
