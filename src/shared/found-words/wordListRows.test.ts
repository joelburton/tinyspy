// cs-blessed-found-words

/**
 * What composing the reveal and the merge in one call promises: the gate is
 * `isEnded` and nothing else, and the missed words it reveals are the bonus
 * ones as well as the required.
 */
import { describe, expect, it } from 'vitest'
import type { FoundWordRow, FoundWordsWord } from './foundWords'
import { buildWordListRows } from './wordListRows'

const WORDS: FoundWordsWord[] = [
  { word: 'alpha', points: 1, pangram: false, bonus: false },
  { word: 'bravo', points: 2, pangram: false, bonus: false },
  { word: 'zulu', points: 9, pangram: false, bonus: true },
]

const found = (word: string, user = 'u1', at = '2026-01-01T00:00:00Z'): FoundWordRow => ({
  word,
  by: { id: user },
  points: 1,
  pangram: false,
  bonus: false,
  at,
})

const words = (rows: { word: string }[]) => rows.map((r) => r.word)

describe('buildWordListRows', () => {
  it('shows only the found words while the game runs', () => {
    const rows = buildWordListRows({
      foundWords: [found('alpha')],
      words: WORDS,
      isEnded: false,
    })
    expect(words(rows)).toEqual(['alpha'])
    expect(rows[0]!.kind).toBe('found')
  })

  it('folds the missed words in at the end, alphabetized under the found ones', () => {
    const rows = buildWordListRows({
      foundWords: [found('alpha')],
      words: WORDS,
      isEnded: true,
    })
    expect(words(rows)).toEqual(['alpha', 'bravo', 'zulu'])
    // The one they found stays theirs; the rest are the reveal.
    expect(rows.map((r) => r.kind)).toEqual(['found', 'unfound', 'unfound'])
  })

  it('keeps every finder of a word several people found', () => {
    const rows = buildWordListRows({
      foundWords: [
        found('alpha', 'u2', '2026-01-01T00:00:02Z'),
        found('alpha', 'u1', '2026-01-01T00:00:01Z'),
      ],
      words: WORDS,
      isEnded: false,
    })
    expect(rows).toHaveLength(1)
    const row = rows[0]!
    expect(row.kind === 'found' && row.userId).toBe('u1') // earliest `at`
    expect(row.kind === 'found' && row.finderIds).toEqual(['u1', 'u2'])
  })
})
