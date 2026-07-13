/**
 * wordwheel-build-board — the PURE board-building core.
 *
 * Extracted from index.ts so it can be unit-tested under `deno test`
 * (index.ts calls serve() + imports the remote std/supabase modules on
 * load, so it can't be imported into a test). Everything here is a pure
 * function of its arguments — no I/O, no Math.random — which is exactly
 * what makes it worth pinning: the multiset tile-spend rule (`fitsTiles`),
 * the required/bonus partition + pangram scoring (`buildBoard`), the
 * overlap cap, and the custom-letter validation are wordwheel's real
 * game-logic surface.
 *
 * See board_test.ts for the coverage and index.ts for the orchestration
 * (sampling, PostgREST fetches, the serve handler) that consumes these.
 */

// ───────────────────────────────────────────────────────────
// Types
// ───────────────────────────────────────────────────────────

/** The board payload handed to wordwheel.create_game. */
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
  /** The wheel's nine letters as a sorted lowercase string (the PK), e.g.
   *  'aabcdeghi' — a MULTISET, so a letter may appear twice. */
  letters: string
  /** The distinct-letter set of `letters` (generated column), for the
   *  overlap cap + the candidate_words subset pre-filter. bigint comes
   *  through PostgREST as string. */
  mask: string
  /** The min difficulty band of a required-quality 9-letter word with this
   *  multiset — we fetch only rows with difficulty <= required_band, so the
   *  pool scales with the game's difficulty. Kept for logging. */
  difficulty: number
  /**
   * Whether the seed's 9 letters include a rare one — {j, q, x, z}
   * (very rare) or {k, v, w, y, b, f, h} (somewhat rare). The diverse
   * builder gives these masks a ×RARE_LETTER_WEIGHT sampling boost so
   * boards aren't dominated by common-letter seeds. Precomputed at
   * import time.
   */
  has_rare_letters: boolean
}

export type CandidateRow = {
  word: string
  /** In the required set (difficulty ≤ required_band, american, no slang, clean:
   *  slur 0 + crude 0) — counts toward the goal. */
  is_required: boolean
  /** In the legal set (difficulty ≤ legal_band) — enterable. Always true here
   *  (candidate_words already pre-filters to legal). */
  is_legal: boolean
}

// ───────────────────────────────────────────────────────────
// Constants (the board-quality knobs)
// ───────────────────────────────────────────────────────────

/** The nine wheel letters (one centre + eight outer). */
export const WHEEL_SIZE = 9
/** Overlap cap with the previous board, in letters out of 9. The wheel
 *  analog of spellingbee's 4-of-7 (~57%); 5-of-9 is ~56%. */
const MAX_PREVIOUS_OVERLAP = 5
/** Weighting boost for has_rare_letters masks. */
const RARE_LETTER_WEIGHT = 3
/** The pangram bonus (+15). A pangram uses all nine tiles. */
const PANGRAM_BONUS = 15

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

/** Per-letter tile counts of a letter string, indexed 0..25 ('a' = 0). The
 *  multiset twin of letterMask — this is what the fit check compares against,
 *  since the mask alone collapses duplicate tiles. */
export function tileCounts(letters: string): Uint8Array {
  const counts = new Uint8Array(26)
  for (let i = 0; i < letters.length; i++) {
    const code = letters.charCodeAt(i) - 97
    if (code >= 0 && code < 26) counts[code]++
  }
  return counts
}

/** The tile-spend rule: a word fits the wheel iff each letter occurs no more
 *  times than the wheel has tiles for it. (Containing the centre is checked
 *  upstream by candidate_words.) */
export function fitsTiles(word: string, wheel: Uint8Array): boolean {
  const used = new Uint8Array(26)
  for (let i = 0; i < word.length; i++) {
    const code = word.charCodeAt(i) - 97
    if (code < 0 || code >= 26) return false
    if (++used[code] > wheel[code]) return false
  }
  return true
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

/** Build the weighted candidate array. A mask appears RARE_LETTER_WEIGHT
 *  times if has_rare_letters; otherwise once. Cheap given pool size. */
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

/** Length-based score: 1pt for 4-letter, length-pt for ≥5. The pangram
 *  +15 bonus is applied inline in buildBoard() where the wheel is in scope. */
export function lengthScore(word: string): number {
  return word.length === 4 ? 1 : word.length
}

/** Given the wheel letters + centre, partition the candidate words into the
 *  required set + the bonus set (legal − required) and tally the required
 *  totals.
 *
 *  This is also where the tile-spend rule is enforced: candidate_words
 *  returns the pure subset set, which includes words demanding more of a
 *  letter than the wheel has tiles (e.g. "seeded" on a wheel with one 'e').
 *  We drop any word whose per-letter counts don't FIT the wheel's tile
 *  counts. The FE membership check mirrors this so submit_word can keep
 *  trusting the shipped list. */
export function buildBoard(
  outerLetters: string,
  centerLetter: string,
  candidateWords: CandidateRow[],
): Board {
  const wheel = tileCounts(outerLetters + centerLetter)
  const required: Board['required_words'] = []
  const bonus: Board['bonus_words'] = []
  let requiredWordsScore = 0
  let requiredWordsCount = 0

  for (const row of candidateWords) {
    // Tile-spend: each letter used no more times than it has tiles.
    if (!fitsTiles(row.word, wheel)) continue
    // Same length + pangram scoring for both sets; the FE reads points off the
    // shipped entry, so bonus words must carry them too. A wordwheel pangram
    // uses all nine tiles — and a 9-letter word that FITS nine tiles must use
    // every one of them, so length alone decides it.
    const isPangram = row.word.length === WHEEL_SIZE
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
 *  Mirrors wordwheel.create_game's letter rules: a single centre + eight
 *  outer letters, lowercase a–z — DUPLICATES ALLOWED (the wheel is a
 *  multiset; a repeated letter just means two tiles carry it, and the
 *  centre may repeat an outer). Unlike spellingbee, 's' is allowed (a tile
 *  per use makes it ordinary). Both inputs are already lowercased/trimmed
 *  by the caller. */
export function validateCustomLetters(center: string, letters: string): string | null {
  if (!/^[a-z]$/.test(center)) {
    return 'custom center must be a single letter a–z'
  }
  if (!/^[a-z]{8}$/.test(letters)) {
    return 'custom letters must be eight letters a–z'
  }
  return null
}
