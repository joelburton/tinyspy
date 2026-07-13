/**
 * `deno test supabase/functions/spellingbee-build-board/board_test.ts`
 * (or `npm run test:edge` to run every edge-function test).
 *
 * Covers the pure board-building core in board.ts: the mask helpers, the
 * required/bonus partition, the +10 pangram bonus (scored by mask EQUALITY,
 * since spellingbee is a 7-letter set not a multiset), scoring, the overlap
 * cap, and the 's'-forbidding custom-letter validation. Dependency-free so it
 * runs offline. The ING-dampening + weighted sampling that use Math.random
 * stay in index.ts and are not unit-tested here.
 */

import {
  type CandidateRow,
  applyOverlapCap,
  buildBoard,
  buildWeightedPool,
  letterMask,
  lengthScore,
  maskLetters,
  popcount26,
  validateCustomLetters,
} from './board.ts'

function eq(actual: unknown, expected: unknown, msg: string): void {
  if (actual !== expected) {
    throw new Error(`${msg}: expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`)
  }
}

/** letter_mask a candidate row would carry (the RPC computes it server-side). */
function cand(word: string, isRequired: boolean): CandidateRow {
  return { word, letter_mask: letterMask(word).toString(), is_required: isRequired, is_legal: true }
}

// ── Bitmask helpers ─────────────────────────────────────────

Deno.test('letterMask / maskLetters round-trip a distinct-letter set', () => {
  eq(letterMask('a'), 1n, "'a' → bit 0")
  eq(maskLetters(letterMask('cabdoen')), 'abcdeno', 'letters come back sorted, deduped')
  eq(maskLetters(letterMask('CABDOEN')), 'abcdeno', 'case-insensitive')
})

Deno.test('popcount26: counts set bits', () => {
  eq(popcount26(0n), 0, 'empty')
  eq(popcount26(letterMask('cabdoen')), 7, 'seven distinct letters')
})

// ── Scoring ─────────────────────────────────────────────────

Deno.test('lengthScore: 1 for a 4-letter word, length for ≥5', () => {
  eq(lengthScore('bead'), 1, '4-letter → 1')
  eq(lengthScore('beacon'), 6, '6-letter → 6')
})

// ── buildBoard: the required/bonus partition + mask-equality pangram ─

Deno.test('buildBoard: partitions required vs bonus, tallies required only', () => {
  const words = [
    cand('bead', true),     // 4 → 1pt, required
    cand('beacon', true),   // 6 → 6pt, required
    cand('acned', false),   // 5 → bonus
  ]
  const board = buildBoard('cabdon', 'e', words)
  eq(board.required_words_count, 2, 'two required words')
  eq(board.required_words_score, 1 + 6, 'required score = 1 + 6')
  eq(board.bonus_words.length, 1, 'one bonus word')
  eq(board.bonus_words[0].points, 5, "'acned' scores 5 as a bonus word")
  eq(board.outer_letters, 'cabdon', 'outer letters echoed')
  eq(board.center_letter, 'e', 'centre echoed')
})

Deno.test('buildBoard: a word using ALL seven letters is a pangram (+10)', () => {
  // Puzzle 'cabdon' + centre 'e' = {a,b,c,d,e,n,o}. 'beacond' uses exactly
  // those seven → mask equals the puzzle mask → pangram.
  const puzzle = 'beacond' // letters {a,b,c,d,e,n,o}
  eq(letterMask(puzzle), letterMask('cabdon' + 'e'), 'sanity: same 7-letter set')
  const board = buildBoard('cabdon', 'e', [cand(puzzle, true)])
  eq(board.required_words[0].is_pangram, true, 'flagged pangram')
  eq(board.required_words[0].points, puzzle.length + 10, 'length + 10 pangram bonus')
})

Deno.test('buildBoard: a word missing a letter is NOT a pangram', () => {
  // 'bead' uses only {a,b,d,e} — a strict subset, not the full set.
  const board = buildBoard('cabdon', 'e', [cand('bead', true)])
  eq(board.required_words[0].is_pangram, false, 'subset is not a pangram')
  eq(board.required_words[0].points, 1, 'plain 4-letter score, no bonus')
})

// ── Overlap cap + weighting ─────────────────────────────────

Deno.test('applyOverlapCap: drops seeds sharing > 4 of 7 letters with the previous board', () => {
  const previous = letterMask('abcdefg') // 7 distinct
  const pool = [
    { mask: letterMask('abcdefg').toString(), required_words_count: 40, has_rare_letters: false }, // 7 shared → drop
    { mask: letterMask('abcdhij').toString(), required_words_count: 40, has_rare_letters: false }, // 4 shared → keep
    { mask: letterMask('hijklmn').toString(), required_words_count: 40, has_rare_letters: false }, // 0 shared → keep
  ]
  const kept = applyOverlapCap(pool, previous)
  eq(kept.length, 2, 'the 7-overlap seed is dropped, ≤4 kept')
})

Deno.test('applyOverlapCap: null previous mask keeps the whole pool', () => {
  const pool = [{ mask: '1', required_words_count: 40, has_rare_letters: false }]
  eq(applyOverlapCap(pool, null).length, 1, 'no previous board → no filtering')
})

Deno.test('buildWeightedPool: rare-letter seeds appear 3×', () => {
  const pool = [
    { mask: '1', required_words_count: 40, has_rare_letters: false },
    { mask: '2', required_words_count: 40, has_rare_letters: true },
  ]
  eq(buildWeightedPool(pool).length, 1 + 3, 'common ×1 + rare ×3')
})

// ── Custom-letter validation (spellingbee forbids 's', needs 7 distinct) ─

Deno.test('validateCustomLetters: seven distinct non-s letters pass', () => {
  eq(validateCustomLetters('e', 'cabdon'), null, 'valid seven-letter set')
})

Deno.test('validateCustomLetters: rejects s, duplicates, and wrong counts', () => {
  eq(
    validateCustomLetters('s', 'cabdon'),
    'custom center must be a single letter a–z (not s)',
    "'s' centre rejected",
  )
  eq(
    validateCustomLetters('e', 'cabdos'),
    'custom letters must be six letters a–z (no s)',
    "'s' among outer letters rejected",
  )
  eq(
    validateCustomLetters('e', 'cabdoe'),
    'all seven custom letters must be different',
    'a duplicate (e appears twice) rejected',
  )
  eq(
    validateCustomLetters('e', 'cabdo'),
    'custom letters must be six letters a–z (no s)',
    'five outer letters rejected',
  )
})
