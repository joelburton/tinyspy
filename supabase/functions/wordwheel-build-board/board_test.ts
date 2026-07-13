/**
 * `deno test supabase/functions/wordwheel-build-board/board_test.ts`
 * (or `npm run test:edge` to run every edge-function test).
 *
 * Covers the pure board-building core in board.ts. The load-bearing case is
 * the MULTISET tile-spend rule (`fitsTiles`) — wordwheel's one game-logic
 * delta from spellingbee — plus buildBoard's required/bonus partition, the
 * +15 pangram bonus, the tile-fit drop, scoring, overlap cap, and
 * custom-letter validation. Dependency-free (no std import) so it runs
 * offline.
 */

import {
  type CandidateRow,
  applyOverlapCap,
  buildBoard,
  buildWeightedPool,
  fitsTiles,
  letterMask,
  lengthScore,
  popcount26,
  tileCounts,
  validateCustomLetters,
  WHEEL_SIZE,
} from './board.ts'

function eq(actual: unknown, expected: unknown, msg: string): void {
  if (actual !== expected) {
    throw new Error(`${msg}: expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`)
  }
}

// ── Bitmask helpers ─────────────────────────────────────────

Deno.test('letterMask: distinct-letter set, case-insensitive, duplicates collapse', () => {
  eq(letterMask('a'), 1n, "'a' → bit 0")
  eq(letterMask('ba'), 0b11n, "'ba' → bits 0+1")
  // A multiset string collapses to its distinct-letter set (the mask can't
  // carry multiplicity — that's what tileCounts is for).
  eq(letterMask('aabc'), letterMask('abc'), 'duplicates collapse')
  eq(letterMask('ABC'), letterMask('abc'), 'case-insensitive')
})

Deno.test('popcount26: counts set bits', () => {
  eq(popcount26(0n), 0, 'empty')
  eq(popcount26(0b1011n), 3, 'three bits')
  eq(popcount26(letterMask('abcdefghi')), 9, 'nine distinct letters')
})

// ── The multiset tile-spend rule (wordwheel's defining mechanic) ─────

Deno.test('tileCounts: per-letter multiplicity, not a set', () => {
  const c = tileCounts('aab')
  eq(c[0], 2, "two 'a' tiles")
  eq(c[1], 1, "one 'b' tile")
  eq(c[2], 0, "no 'c'")
})

Deno.test('fitsTiles: a word may spend a letter only as many times as it has tiles', () => {
  // Wheel 'abcdefgi' + centre 'e' → one 'e' tile (letters: a b c d e f g i, e).
  const wheel = tileCounts('abcdefgi' + 'e')
  eq(fitsTiles('bead', wheel), true, "'bead' fits (each letter once)")
  eq(fitsTiles('faced', wheel), true, "'faced' fits")
  // 'seeded' needs three 'e's but the wheel has one → rejected. This is the
  // exact case the doc calls out (candidate_words returns it, buildBoard drops it).
  const wheelOneE = tileCounts('sdxyzabc' + 'e')
  eq(fitsTiles('seeded', wheelOneE), false, "'seeded' needs 3 e's, wheel has 1")
})

Deno.test('fitsTiles: two tiles of a letter allow two uses', () => {
  // A multiset wheel with two 'e' tiles: 'abcdefge' outer + 'e' centre = three e's.
  const wheel = tileCounts('abcdefge' + 'e')
  eq(fitsTiles('feee', wheel), true, "three e's fit three e-tiles")
  eq(fitsTiles('feeee', wheel), false, "four e's exceed three e-tiles")
})

Deno.test('fitsTiles: a letter absent from the wheel never fits', () => {
  const wheel = tileCounts('abcdefgh' + 'i')
  eq(fitsTiles('zap', wheel), false, "'z' has no tile")
})

// ── Scoring ─────────────────────────────────────────────────

Deno.test('lengthScore: 1 for a 4-letter word, length for ≥5', () => {
  eq(lengthScore('bead'), 1, '4-letter → 1')
  eq(lengthScore('beads'), 5, '5-letter → 5')
  eq(lengthScore('abcdefghi'), 9, '9-letter → 9')
})

// ── buildBoard: the required/bonus partition + tile-fit + pangram ────

Deno.test('buildBoard: partitions required vs bonus, tallies required only', () => {
  const words: CandidateRow[] = [
    { word: 'bead', is_required: true, is_legal: true },   // 4 → 1pt, required
    { word: 'faced', is_required: true, is_legal: true },  // 5 → 5pt, required
    { word: 'cabbie', is_required: false, is_legal: true }, // bonus (won't fit; see below)
  ]
  // Wheel with a single 'b' tile so 'cabbie' (two b's) is DROPPED — proves
  // the tile-fit filter runs before scoring, on bonus words too.
  const board = buildBoard('abcdfgi', 'e', words)
  eq(board.required_words_count, 2, 'two required words counted')
  eq(board.required_words_score, 1 + 5, 'required score = 1 + 5')
  eq(board.required_words.length, 2, 'required list has 2')
  eq(board.bonus_words.length, 0, "'cabbie' dropped (two b's, one b-tile)")
  eq(board.outer_letters, 'abcdfgi', 'outer letters echoed')
  eq(board.center_letter, 'e', 'centre echoed')
})

Deno.test('buildBoard: a 9-letter word that fits IS a pangram (+15)', () => {
  // 'abcdefghi' uses all nine distinct tiles once — fits and is a pangram.
  const words: CandidateRow[] = [
    { word: 'abcdefghi', is_required: true, is_legal: true },
  ]
  const board = buildBoard('abcdefgh', 'i', words)
  eq(board.required_words_count, 1, 'the pangram counts')
  eq(board.required_words[0].is_pangram, true, 'flagged pangram')
  eq(board.required_words[0].points, WHEEL_SIZE + 15, 'length 9 + 15 pangram bonus')
})

Deno.test('buildBoard: bonus words score but do not touch the required tally', () => {
  const words: CandidateRow[] = [
    { word: 'bead', is_required: false, is_legal: true }, // bonus, fits
  ]
  const board = buildBoard('abcdfgi', 'e', words)
  eq(board.required_words_count, 0, 'no required')
  eq(board.required_words_score, 0, 'required score 0')
  eq(board.bonus_words.length, 1, 'one bonus word')
  eq(board.bonus_words[0].points, 1, "'bead' scores 1 as a bonus word too")
})

// ── Overlap cap + weighting ─────────────────────────────────

Deno.test('applyOverlapCap: drops seeds sharing > 5 of 9 letters with the previous board', () => {
  const previous = letterMask('abcdefghi') // 9 distinct
  const pool = [
    { letters: 'abcdefghi', mask: letterMask('abcdefghi').toString(), difficulty: 1, has_rare_letters: false }, // 9 shared → drop
    { letters: 'abcdejklm', mask: letterMask('abcdejklm').toString(), difficulty: 1, has_rare_letters: false }, // 5 shared → keep
    { letters: 'jklmnopqr', mask: letterMask('jklmnopqr').toString(), difficulty: 1, has_rare_letters: false }, // 0 shared → keep
  ]
  const kept = applyOverlapCap(pool, previous)
  eq(kept.length, 2, 'the 9-overlap seed is dropped, ≤5 kept')
  eq(kept.some((r) => r.letters === 'abcdefghi'), false, 'the identical seed is gone')
})

Deno.test('applyOverlapCap: null previous mask keeps the whole pool', () => {
  const pool = [
    { letters: 'abcdefghi', mask: '1', difficulty: 1, has_rare_letters: false },
  ]
  eq(applyOverlapCap(pool, null).length, 1, 'no previous board → no filtering')
})

Deno.test('buildWeightedPool: rare-letter seeds appear 3×', () => {
  const pool = [
    { letters: 'aaaaaaaaa', mask: '1', difficulty: 1, has_rare_letters: false },
    { letters: 'jqxzbcdef', mask: '2', difficulty: 1, has_rare_letters: true },
  ]
  const weighted = buildWeightedPool(pool)
  eq(weighted.length, 1 + 3, 'common ×1 + rare ×3')
  eq(weighted.filter((r) => r.has_rare_letters).length, 3, 'the rare seed is tripled')
})

// ── Custom-letter validation (wordwheel allows dupes + 's') ──────────

Deno.test('validateCustomLetters: eight outer + one centre, dupes and s allowed', () => {
  eq(validateCustomLetters('e', 'abcdfghi'), null, 'valid nine-letter wheel')
  eq(validateCustomLetters('s', 'aabcdefg'), null, "'s' centre allowed + duplicate 'a' allowed")
  eq(validateCustomLetters('e', 'ssssssss'), null, 'all-s outer is legal (multiset)')
})

Deno.test('validateCustomLetters: rejects a bad centre or wrong outer length', () => {
  eq(
    validateCustomLetters('ab', 'abcdefgh'),
    'custom center must be a single letter a–z',
    'two-char centre rejected',
  )
  eq(
    validateCustomLetters('e', 'abcdefg'),
    'custom letters must be eight letters a–z',
    'seven outer letters rejected',
  )
  eq(
    validateCustomLetters('3', 'abcdefgh'),
    'custom center must be a single letter a–z',
    'non-letter centre rejected',
  )
})
