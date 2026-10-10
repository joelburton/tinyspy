// cs-unmet

import { describe, expect, it } from 'vitest'
import { scoreWord } from './score'
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
