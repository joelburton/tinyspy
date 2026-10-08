// cs-unmet

/**
 * `deno test supabase/functions/wordleone-build-board/gen_test.ts`
 *
 * The generator's filters, each pinned on a small planted word list.
 * Dependency-free (no std import) so it runs offline.
 */

import { mulberry32 } from '../../../src/common/utils/mulberry32.ts'
import {
  buildPuzzle, colorsOf, isPlural, MAX_POSITIVE_SPACE, poolBandFor, shapeOf, TIER_SHAPES, tierOf, type WordRow,
} from './gen.ts'

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
const EVERY_SHAPE = new Set(Object.values(TIER_SHAPES).flat())

Deno.test('colorsOf: scores greens, yellows and grays', () => {
  eq(colorsOf('crane', 'crane'), 'ggggg', 'all green')
  eq(colorsOf('crane', 'trace'), 'yggxg', 'mixed')
})

Deno.test('colorsOf: a yellow only while the answer has an unclaimed copy', () => {
  // SPEED against ABIDE: one E in the answer, two in the guess — the first takes it.
  eq(colorsOf('speed', 'abide'), 'xxyxy', 'one copy, two guesses')
  // LEVEL against HELLO: the green L claims first, the leading L still finds the second.
  eq(colorsOf('level', 'hello'), 'ygxxy', 'the green claims first')
})

Deno.test('shapeOf and tierOf: the colors read as greens · yellows · grays, and a tier owns each shape', () => {
  eq(shapeOf('yxyyx'), '0g3y2x', 'three yellows, two grays')
  eq(tierOf('yxyyx'), 'hard', 'hard')
  eq(tierOf('gxgxg'), 'easy', 'easy')
  eq(tierOf('xyygg'), 'medium', 'medium')
  eq(tierOf('yyyyy'), null, 'an anagram belongs to no tier')
  eq(tierOf('ggggx'), null, 'four greens belongs to no tier')
  eq(tierOf('gyyyy'), null, 'a green and the rest yellow belongs to no tier')
})

Deno.test('poolBandFor: two above the answer band, capped at 6, the NYT list counting as 2', () => {
  eq(poolBandFor(0), 4, 'band 0')
  eq(poolBandFor(1), 3, 'band 1')
  eq(poolBandFor(4), 6, 'band 4')
  eq(poolBandFor(5), 6, 'band 5')
  eq(poolBandFor(6), 6, 'band 6')
})

Deno.test('isPlural: needs a different root and a final s', () => {
  eq(isPlural(row('rings', 1, false, { root: 'ring' })), true, 'rings')
  eq(isPlural(row('glass', 1, true, { root: 'glass' })), false, 'glass')
  eq(isPlural(row('crane', 1, true)), false, 'crane')
})

Deno.test('buildPuzzle: unique in the pool, in a tier, and within every filter', () => {
  for (let seed = 1; seed <= 30; seed++) {
    const answerBand = seed % 6
    const puzzle = buildPuzzle(WORDS, { answerBand, tier: 'any', random: mulberry32(seed) })
    ok(puzzle !== null, `seed ${seed} band ${answerBand}: a puzzle`)
    const { starter, colors, answer, positiveSpace, tier } = puzzle!
    const at = `seed ${seed} band ${answerBand}`
    eq(colors, colorsOf(starter, answer), `${at}: the colors are the starter scored against the answer`)
    ok(EVERY_SHAPE.has(shapeOf(colors)), `${at}: ${colors} is a tier's shape`)
    eq(tierOf(colors), tier, `${at}: the tier is the shape's`)
    ok(positiveSpace <= MAX_POSITIVE_SPACE, `${at}: the positive-space ceiling`)
    const answerRow = BY_WORD.get(answer)!
    if (answerBand === 0) ok(answerRow.isAnswerList, `${at}: a band-0 answer is on the NYT list`)
    else ok(answerRow.band <= answerBand && !isPlural(answerRow), `${at}: the answer is in the band and no plural`)
    ok(answerRow.isClean, `${at}: the answer is clean`)
    ok(!isPlural(BY_WORD.get(starter)!), `${at}: the starter is no plural`)
    ok(BY_WORD.get(starter)!.isClean, `${at}: the starter is clean`)
    ok(starter !== answer, `${at}: the starter is not the answer`)
    const pool = poolBandFor(answerBand)
    const others = WORDS.filter((r) => r.band <= pool && r.word !== answer && colorsOf(starter, r.word) === colors)
    eq(others.length, 0, `${at}: ${starter} ${colors} → ${answer} is the only fit at band ${pool}`)
  }
})

Deno.test('buildPuzzle: an anagram is no puzzle — every tile colored, nothing to rule out', () => {
  // The only starters are anagrams of the only answer: all yellow, or a green and the rest yellow.
  const anagrams = [row('stare', 1, true), row('rates', 1, false), row('tares', 1, false), row('aster', 1, false)]
  eq(buildPuzzle(anagrams, { answerBand: 0, tier: 'any', random: mulberry32(1) }), null, 'no gray, no puzzle')
  // Beside the anagrams, the one starter with a gray (STAIR → gggxy) is the one taken.
  const withGray = [...anagrams, row('stair', 1, false)]
  eq(buildPuzzle(withGray, { answerBand: 0, tier: 'any', random: mulberry32(1) })?.starter, 'stair', 'the starter with a gray')
})

Deno.test('buildPuzzle: honors the tier asked for', () => {
  eq(buildPuzzle(WORDS, { answerBand: 0, tier: 'easy', random: mulberry32(7) })?.greens, 3, 'easy')
  eq(buildPuzzle(WORDS, { answerBand: 0, tier: 'hard', random: mulberry32(7) })?.greens, 0, 'hard')
})

Deno.test('buildPuzzle: the answer band picks the answer, the NYT list at 0 and any clean word above', () => {
  // Band 5 reaches the off-list words; across seeds, one of them is drawn.
  let offList = false
  for (let seed = 1; seed <= 40 && !offList; seed++) {
    const puzzle = buildPuzzle(WORDS, { answerBand: 5, tier: 'any', random: mulberry32(seed) })
    offList = puzzle !== null && !BY_WORD.get(puzzle.answer)!.isAnswerList
  }
  ok(offList, 'band 5 draws an off-list answer')
  for (let seed = 1; seed <= 20; seed++) {
    const puzzle = buildPuzzle(WORDS, { answerBand: 0, tier: 'any', random: mulberry32(seed) })!
    ok(BY_WORD.get(puzzle.answer)!.isAnswerList, `seed ${seed}: band 0 stays on the list`)
  }
})

Deno.test('buildPuzzle: reproducible from its seed', () => {
  const a = buildPuzzle(WORDS, { answerBand: 3, tier: 'medium', random: mulberry32(42) })
  const b = buildPuzzle(WORDS, { answerBand: 3, tier: 'medium', random: mulberry32(42) })
  eq(JSON.stringify(a), JSON.stringify(b), 'the same seed, the same puzzle')
})

Deno.test('buildPuzzle: under answerAtBand, the answer is a clean non-plural word at exactly the band', () => {
  for (const band of [3, 4, 5]) {
    const puzzle = buildPuzzle(WORDS, { answerBand: band, tier: 'any', random: mulberry32(band), answerAtBand: true })
    ok(puzzle !== null, `band ${band}: a puzzle`)
    const answer = BY_WORD.get(puzzle!.answer)!
    eq(answer.band, band, `band ${band}: the answer's band`)
    eq(answer.isAnswerList, false, `band ${band}: off the list`)
    eq(isPlural(answer), false, `band ${band}: no plural`)
    // The off-list answer counts itself, as a listed answer always does.
    ok(puzzle!.positiveSpace >= 1, `band ${band}: positive space counts the answer`)
  }
  // Band 6 has no word at all in the fixture.
  eq(buildPuzzle(WORDS, { answerBand: 6, tier: 'any', random: mulberry32(1), answerAtBand: true }), null, 'band 6')
})

Deno.test('buildPuzzle: null with no answer, and null with no starter', () => {
  const obscureOnly = WORDS.filter((r) => !r.isAnswerList)
  eq(buildPuzzle(obscureOnly, { answerBand: 0, tier: 'any', random: mulberry32(1) }), null, 'band 0 with no list word')
  eq(buildPuzzle(obscureOnly, { answerBand: 6, tier: 'any', random: mulberry32(1) }), null, 'no word at band 2 to start from')
})
