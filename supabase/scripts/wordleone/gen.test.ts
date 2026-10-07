// cs-unmet

import { describe, expect, it } from 'vitest'
import { mulberry32 } from '../../../src/common/utils/mulberry32'
import { buildPuzzle, colorsOf, isPlural, MAX_GREENS, MAX_POSITIVE_SPACE, tierOf, type WordRow } from './gen'

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

describe('colorsOf', () => {
  it('scores greens, yellows and grays', () => {
    expect(colorsOf('crane', 'crane')).toBe('ggggg')
    expect(colorsOf('crane', 'trace')).toBe('yggxg')
  })
  it('gives a yellow only while the answer has an unclaimed copy', () => {
    // abide has one e; the first e of speed takes it, the second gets nothing
    expect(colorsOf('speed', 'abide')).toBe('xxyxy')
    // hello's one e is claimed by the green, so level's other e is gray
    expect(colorsOf('level', 'hello')).toBe('ygxxy')
  })
})

describe('tierOf', () => {
  it('maps greens to tiers and refuses four or five', () => {
    expect(tierOf(3)).toBe('easy')
    expect(tierOf(2)).toBe('medium')
    expect(tierOf(1)).toBe('medium')
    expect(tierOf(0)).toBe('hard')
    expect(tierOf(4)).toBeNull()
    expect(tierOf(5)).toBeNull()
  })
})

describe('isPlural', () => {
  it('needs a different root and a final s', () => {
    expect(isPlural(row('rings', 1, false, { root: 'ring' }))).toBe(true)
    expect(isPlural(row('glass', 1, true, { root: 'glass' }))).toBe(false)
    expect(isPlural(row('crane', 1, true))).toBe(false)
  })
})

describe('buildPuzzle', () => {
  const byWord = new Map(WORDS.map((r) => [r.word, r]))

  it('returns a puzzle that is unique in the band, in the tier, and within the filters', () => {
    for (let seed = 1; seed <= 30; seed++) {
      const band = 1 + (seed % 5)
      const puzzle = buildPuzzle(WORDS, { band, tier: 'any', random: mulberry32(seed) })
      expect(puzzle, `seed ${seed} band ${band}`).not.toBeNull()
      const { starter, colors, answer, greens, positiveSpace, tier } = puzzle!
      expect(colors).toBe(colorsOf(starter, answer))
      expect(greens).toBeLessThanOrEqual(MAX_GREENS)
      expect(tierOf(greens)).toBe(tier)
      expect(positiveSpace).toBeLessThanOrEqual(MAX_POSITIVE_SPACE)
      expect(byWord.get(answer)!.isAnswerList).toBe(true)
      expect(byWord.get(answer)!.band).toBeLessThanOrEqual(band)
      expect(isPlural(byWord.get(starter)!)).toBe(false)
      expect(byWord.get(starter)!.isClean).toBe(true)
      const others = WORDS.filter((r) => r.band <= band && r.word !== answer && colorsOf(starter, r.word) === colors)
      expect(others, `${starter} ${colors} → ${answer} also fits`).toEqual([])
    }
  })

  it('honors the tier asked for', () => {
    const easy = buildPuzzle(WORDS, { band: 2, tier: 'easy', random: mulberry32(7) })
    expect(easy?.greens).toBe(3)
    const hard = buildPuzzle(WORDS, { band: 2, tier: 'hard', random: mulberry32(7) })
    expect(hard?.greens).toBe(0)
  })

  it('is reproducible from its seed', () => {
    const a = buildPuzzle(WORDS, { band: 3, tier: 'medium', random: mulberry32(42) })
    const b = buildPuzzle(WORDS, { band: 3, tier: 'medium', random: mulberry32(42) })
    expect(a).toEqual(b)
  })

  it('under answerAtBand, the answer is a clean non-plural word at exactly the band, listed or not', () => {
    for (const band of [3, 4, 5]) {
      const puzzle = buildPuzzle(WORDS, { band, tier: 'any', random: mulberry32(band), answerAtBand: true })
      expect(puzzle, `band ${band}`).not.toBeNull()
      const answer = byWord.get(puzzle!.answer)!
      expect(answer.band).toBe(band)
      expect(answer.isAnswerList).toBe(false)
      expect(isPlural(answer)).toBe(false)
      // The off-list answer counts itself, as a listed answer always does.
      expect(puzzle!.positiveSpace).toBeGreaterThanOrEqual(1)
    }
    // Band 6 has no word at all in the fixture.
    expect(buildPuzzle(WORDS, { band: 6, tier: 'any', random: mulberry32(1), answerAtBand: true })).toBeNull()
  })

  it('answers null when the band has no answer-list word', () => {
    const obscureOnly = WORDS.filter((r) => !r.isAnswerList)
    expect(buildPuzzle(obscureOnly, { band: 6, tier: 'any', random: mulberry32(1) })).toBeNull()
  })
})
