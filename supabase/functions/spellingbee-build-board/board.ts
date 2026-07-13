/**
 * spellingbee-build-board — the PURE board-building core.
 *
 * Extracted from index.ts so it can be unit-tested under `deno test`
 * (index.ts calls serve() + imports the remote std/supabase modules on
 * load, so it can't be imported into a test). Everything here is a pure
 * function of its arguments — no I/O, no Math.random. The ING-dampening
 * and weighted sampling that DO use Math.random stay in index.ts.
 *
 * See board_test.ts for the coverage. wordwheel-build-board/board.ts is the
 * near-twin — this one scores pangrams by mask EQUALITY (a 7-letter set,
 * not a multiset), applies the +10 bonus, and forbids 's' in custom letters.
 */

// ───────────────────────────────────────────────────────────
// Types
// ───────────────────────────────────────────────────────────

/** The board payload handed to spellingbee.create_game. */
export type Board = {
  outer_letters: string
  center_letter: string
  required_words_score: number
  required_words_count: number
  /** The required set: words in the smaller list (the displayed goal). */
  required_words: Array<{ word: string; points: number; is_pangram: boolean }>
  /** The bonus set (legal − required): accepted + scored, not the goal. Same
   *  { word, points, is_pangram } shape as required so the FE scores it locally. */
  bonus_words: Array<{ word: string; points: number; is_pangram: boolean }>
}

export type PangramRow = {
  mask: string                // bigint comes through PostgREST as string
  /** How many required words fit this 7-letter seed — the ≥30 gate. */
  required_words_count: number
  /**
   * Whether the seed's 7 letters include a rare one — {j, q, x, z}
   * (very rare) or {k, v, w, y} (somewhat rare). The diverse builder
   * gives these masks a ×RARE_LETTER_WEIGHT sampling boost so boards
   * aren't dominated by common-letter seeds (e, a, i, r, t, …).
   * Precomputed at import time.
   */
  has_rare_letters: boolean
}

export type CandidateRow = {
  word: string
  letter_mask: string
  /** In the required set (band ≤ 3, american, no slang, clean: slur 0 +
   *  crude 0) — counts toward the goal. */
  is_required: boolean
  /** In the legal set (band ≤ 5) — enterable. Always true here
   *  (candidate_words already pre-filters to legal). */
  is_legal: boolean
}

// ───────────────────────────────────────────────────────────
// Constants
// ───────────────────────────────────────────────────────────

/** Overlap cap with the previous board, in letters out of 7. */
const MAX_PREVIOUS_OVERLAP = 4
/** Weighting boost for has_rare_letters masks. */
const RARE_LETTER_WEIGHT = 3
/** The pangram bonus (+10). A pangram uses all seven letters. */
const PANGRAM_BONUS = 10

// ───────────────────────────────────────────────────────────
// Bitmask helpers
// ───────────────────────────────────────────────────────────

export function letterMask(s: string): bigint {
  let mask = 0n
  for (const ch of s.toLowerCase()) {
    const code = ch.charCodeAt(0) - 97
    if (code >= 0 && code < 26) mask |= 1n << BigInt(code)
  }
  return mask
}

export function popcount26(mask: bigint): number {
  let m = mask
  let count = 0
  while (m !== 0n) {
    count += Number(m & 1n)
    m >>= 1n
  }
  return count
}

/** Letters in the mask, as a lowercase string ('a' = bit 0). */
export function maskLetters(mask: bigint): string {
  let out = ''
  for (let i = 0; i < 26; i++) {
    if ((mask & (1n << BigInt(i))) !== 0n) {
      out += String.fromCharCode(97 + i)
    }
  }
  return out
}

// ───────────────────────────────────────────────────────────
// Diverse builder (the pure parts)
// ───────────────────────────────────────────────────────────

/** Filter the pangram pool by the previous-board overlap cap.
 *  Returns the input unchanged when previousMask is null. */
export function applyOverlapCap(
  pool: PangramRow[],
  previousMask: bigint | null,
): PangramRow[] {
  if (previousMask === null) return pool
  return pool.filter((row) => {
    const overlap = popcount26(BigInt(row.mask) & previousMask)
    return overlap <= MAX_PREVIOUS_OVERLAP
  })
}

/** Build the weighted candidate array. A mask appears
 *  RARE_LETTER_WEIGHT times if has_rare_letters; otherwise once.
 *  Cheap given pool size (~3.5k → ~7-10k after weighting). */
export function buildWeightedPool(pool: PangramRow[]): PangramRow[] {
  const weighted: PangramRow[] = []
  for (const row of pool) {
    const reps = row.has_rare_letters ? RARE_LETTER_WEIGHT : 1
    for (let i = 0; i < reps; i++) weighted.push(row)
  }
  return weighted
}

// ───────────────────────────────────────────────────────────
// Word enumeration + scoring (required + bonus)
// ───────────────────────────────────────────────────────────

/** Length-based score: 1pt for 4-letter, length-pt for ≥5.
 *  The pangram +10 bonus is applied inline in buildBoard()
 *  where we already have the puzzleMask in scope. */
export function lengthScore(word: string): number {
  return word.length === 4 ? 1 : word.length
}

/** Given the puzzle mask + center, partition the candidate words
 *  into the required set + the bonus set (legal − required) and tally
 *  the required totals. */
export function buildBoard(
  outerLetters: string,
  centerLetter: string,
  candidateWords: CandidateRow[],
): Board {
  const puzzleMask = letterMask(outerLetters + centerLetter)
  const required: Board['required_words'] = []
  const bonus: Board['bonus_words'] = []
  let requiredWordsScore = 0
  let requiredWordsCount = 0

  for (const row of candidateWords) {
    const wMask = BigInt(row.letter_mask)
    // Same length + pangram scoring for both sets; the FE reads points off the
    // shipped entry, so bonus words must carry them too. A pangram uses every
    // one of the seven letters, i.e. its letter-set EQUALS the puzzle set.
    const isPangram = wMask === puzzleMask
    const points = lengthScore(row.word) + (isPangram ? PANGRAM_BONUS : 0)
    if (row.is_required) {
      required.push({ word: row.word, points, is_pangram: isPangram })
      requiredWordsScore += points
      requiredWordsCount++
    } else {
      bonus.push({ word: row.word, points, is_pangram: isPangram })
    }
  }

  return {
    outer_letters: outerLetters,
    center_letter: centerLetter,
    required_words_score: requiredWordsScore,
    required_words_count: requiredWordsCount,
    required_words: required,
    bonus_words: bonus,
  }
}

/** Validate a custom (player-specified) letter set, or null if it's fine.
 *  Mirrors spellingbee.create_game's letter rules + the FE's `customLettersError`:
 *  a single center + six OTHER letters, all seven distinct lowercase a–z, none
 *  being 's' (the Spelling Bee rule). Both inputs are already lowercased/trimmed
 *  by the caller. */
export function validateCustomLetters(center: string, letters: string): string | null {
  if (!/^[a-z]$/.test(center) || center === 's') {
    return 'custom center must be a single letter a–z (not s)'
  }
  if (!/^[a-z]{6}$/.test(letters) || letters.includes('s')) {
    return 'custom letters must be six letters a–z (no s)'
  }
  if (new Set(center + letters).size !== 7) {
    return 'all seven custom letters must be different'
  }
  return null
}
