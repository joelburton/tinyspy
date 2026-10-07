// cs-unmet

/**
 * `deno test supabase/functions/wordleone-build-board/gen_test.ts`
 *
 * The generator's filters, each pinned on a small planted word list.
 * Dependency-free (no std import) so it runs offline.
 */

import { mulberry32 } from '../../../src/common/utils/mulberry32.ts'
import { buildPuzzle, colorsOf, isPlural, MAX_GREENS, MAX_POSITIVE_SPACE, tierOf, type WordRow } from './gen.ts'

function eq(actual: unknown, expected: unknown, msg: string): void {
  if (actual !== expected) {
    throw new Error(`${msg}: expected ${expected}, got ${actual}`)
  }
}

function ok(value: boolean, msg: string): void {
  if (!value) throw new Error(msg)
}

/** Fixture rows: a word, its band, and whether it is on the NYT answer list. Clean unless said. */
function row(word: string, band: number, isAnswerList: boolean, extra: Partial<WordRow> = {}): WordRow {
  return { word, band, isAnswerList, isClean: true, root: null, ...extra }
}

const WORDS: WordRow[] = [
  row('crane', 1, true), row('crate', 1, true), row('trace', 1, true), row('react', 1, true),
  row('cater', 2, true), row('grace', 1, true), row('brace', 2, true), row('place', 1, true),
  row('plane', 1, true), row('plant', 1, true), row('slant', 2, true), row('stare', 1, true),
  row('snare', 2, true), row('spare', 1, true), row('scare', 1, true), row('score', 1, true),
  row('store', 1, true), row('shore', 1, true), row('shone', 2, true), row('stone', 1, true),
  row('atone', 2, true), row('alone', 1, true), row('along', 1, true), row('among', 1, true),
  row('mango', 2, true), row('tango', 2, true), row('bingo', 2, true), row('hello', 1, true),
  row('level', 1, true), row('speed', 1, true), row('abide', 2, true), row('lingo', 3, false),
  row('pinto', 4, false), row('caret', 3, false), row('carte', 5, false),
  row('rings', 1, false, { root: 'ring' }),
  row('damns', 2, false, { isClean: false }),
]
const BY_WORD = new Map(WORDS.map((r) => [r.word, r]))

Deno.test('colorsOf: scores greens, yellows and grays', () => {
  eq(colorsOf('crane', 'crane'), 'ggggg', 'all green')
  eq(colorsOf('crane', 'trace'), 'yggxg', 'mixed')
})

Deno.test('colorsOf: a yellow only while the answer has an unclaimed copy', () => {
  // abide has one e; the first e of speed takes it, the second gets nothing
  eq(colorsOf('speed', 'abide'), 'xxyxy', 'one copy, two guesses')
  // hello's one e is claimed by the green, so level's other e is gray
  eq(colorsOf('level', 'hello'), 'ygxxy', 'the green claims first')
})

Deno.test('tierOf: maps greens to tiers and refuses four or five', () => {
  eq(tierOf(3), 'easy', '3')
  eq(tierOf(2), 'medium', '2')
  eq(tierOf(1), 'medium', '1')
  eq(tierOf(0), 'hard', '0')
  eq(tierOf(4), null, '4')
  eq(tierOf(5), null, '5')
})

Deno.test('isPlural: needs a different root and a final s', () => {
  eq(isPlural(row('rings', 1, false, { root: 'ring' })), true, 'rings')
  eq(isPlural(row('glass', 1, true, { root: 'glass' })), false, 'glass')
  eq(isPlural(row('crane', 1, true)), false, 'crane')
})

Deno.test('buildPuzzle: unique in the band, in the tier, and within every filter', () => {
  for (let seed = 1; seed <= 30; seed++) {
    const band = 1 + (seed % 5)
    const puzzle = buildPuzzle(WORDS, { band, tier: 'any', random: mulberry32(seed) })
    ok(puzzle !== null, `seed ${seed} band ${band}: a puzzle`)
    const { starter, colors, answer, greens, positiveSpace, tier } = puzzle!
    const at = `seed ${seed} band ${band}`
    eq(colors, colorsOf(starter, answer), `${at}: the colors are the starter scored against the answer`)
    ok(greens <= MAX_GREENS, `${at}: never four greens`)
    eq(tierOf(greens), tier, `${at}: the tier is the green count's`)
    ok(positiveSpace <= MAX_POSITIVE_SPACE, `${at}: the positive-space ceiling`)
    ok(BY_WORD.get(answer)!.isAnswerList, `${at}: the answer is on the NYT list`)
    ok(BY_WORD.get(answer)!.band <= band, `${at}: the answer is in the band`)
    ok(!isPlural(BY_WORD.get(starter)!), `${at}: the starter is no plural`)
    ok(BY_WORD.get(starter)!.isClean, `${at}: the starter is clean`)
    ok(starter !== answer, `${at}: the starter is not the answer`)
    const others = WORDS.filter((r) => r.band <= band && r.word !== answer && colorsOf(starter, r.word) === colors)
    eq(others.length, 0, `${at}: ${starter} ${colors} → ${answer} is the only fit`)
  }
})

Deno.test('buildPuzzle: honors the tier asked for', () => {
  eq(buildPuzzle(WORDS, { band: 2, tier: 'easy', random: mulberry32(7) })?.greens, 3, 'easy')
  eq(buildPuzzle(WORDS, { band: 2, tier: 'hard', random: mulberry32(7) })?.greens, 0, 'hard')
})

Deno.test('buildPuzzle: reproducible from its seed', () => {
  const a = buildPuzzle(WORDS, { band: 3, tier: 'medium', random: mulberry32(42) })
  const b = buildPuzzle(WORDS, { band: 3, tier: 'medium', random: mulberry32(42) })
  eq(JSON.stringify(a), JSON.stringify(b), 'the same seed, the same puzzle')
})

Deno.test('buildPuzzle: under answerAtBand, the answer is a clean non-plural word at exactly the band', () => {
  for (const band of [3, 4, 5]) {
    const puzzle = buildPuzzle(WORDS, { band, tier: 'any', random: mulberry32(band), answerAtBand: true })
    ok(puzzle !== null, `band ${band}: a puzzle`)
    const answer = BY_WORD.get(puzzle!.answer)!
    eq(answer.band, band, `band ${band}: the answer's band`)
    eq(answer.isAnswerList, false, `band ${band}: off the list`)
    eq(isPlural(answer), false, `band ${band}: no plural`)
    // The off-list answer counts itself, as a listed answer always does.
    ok(puzzle!.positiveSpace >= 1, `band ${band}: positive space counts the answer`)
  }
  // Band 6 has no word at all in the fixture.
  eq(buildPuzzle(WORDS, { band: 6, tier: 'any', random: mulberry32(1), answerAtBand: true }), null, 'band 6')
})

Deno.test('buildPuzzle: null when the band has no answer-list word', () => {
  const obscureOnly = WORDS.filter((r) => !r.isAnswerList)
  eq(buildPuzzle(obscureOnly, { band: 6, tier: 'any', random: mulberry32(1) }), null, 'no answers')
})
