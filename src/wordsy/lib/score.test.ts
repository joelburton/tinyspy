// cs-unmet

import { describe, expect, it } from 'vitest'
import { scoreLetters, scoreWord } from './score'
import { ZTest_TABLE } from './gameData.fixture'

/**
 * The rulebook's examples against the planted table — the same list
 * supabase/tests/wordsy/score_test.sql pins `wordsy._score_word` to, so the
 * live score under the entry and the server's score agree.
 */
describe('scoreWord', () => {
  const cases: [string, number, string][] = [
    ['dr', 6, 'D in the 4 column and R in the 2 column'],
    ['elf', 9, 'F is red: 5 + 1, and L 3'],
    ['quell', 7, 'Q is blue: 2 + 2, and one L card for two Ls'],
    ['bob', 5, 'two Bs against one B card score one B'],
    ['cab', 9, 'one C against two C cards scores the better, and B'],
    ['accept', 7, 'two Cs against two C cards score both'],
    ['ghost', 0, 'letters with no card score nothing'],
    ['aeiou', 0, 'vowels are never cards'],
    ['', 0, 'no word scores 0'],
  ]
  for (const [word, score, why] of cases) {
    it(`${word || "''"} scores ${score}: ${why}`, () => {
      expect(scoreWord(word, ZTest_TABLE)).toBe(score)
    })
  }
})

/**
 * Which letter took which card — the same rule, letter by letter. The table:
 * F45 B1 C5 D9 L17 C6 Q58 R33, worth 6 5 4 4 3 3 4 2.
 */
describe('scoreLetters', () => {
  /** Each letter's card id, or '-' for none. */
  const cards = (word: string) => scoreLetters(word, ZTest_TABLE).map((l) => l.tile?.id ?? '-').join(' ')

  it('a letter with no card scores on nothing', () => {
    expect(cards('ghost')).toBe('- - - - -')
  })

  it('two Bs against one B card: the first B scores, the second does not', () => {
    expect(cards('bob')).toBe('1 - -')
  })

  it('one C against two C cards takes the better; two Cs take both, the better first', () => {
    expect(cards('cab')).toBe('5 - 1')
    expect(cards('accept')).toBe('- 5 6 - - -')
  })

  it('a rare card is the letter\'s card', () => {
    expect(scoreLetters('elf', ZTest_TABLE).map((l) => l.tile?.bonus ?? null)).toEqual([null, 0, 1])
  })

  it('scoreWord is the sum of the cards scoreLetters picks', () => {
    for (const word of ['dr', 'elf', 'quell', 'bob', 'cab', 'accept', 'ghost', '']) {
      const sum = scoreLetters(word, ZTest_TABLE)
        .reduce((s, l) => s + (l.tile === null ? 0 : l.tile.value + l.tile.bonus), 0)
      expect(scoreWord(word, ZTest_TABLE)).toBe(sum)
    }
  })
})
