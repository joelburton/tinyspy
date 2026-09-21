// cs-met-found-words

/**
 * What composing the reveal and the merge in one call promises: the gate is
 * `isTerminal` and nothing else, and `hasBonus` decides how much of the missed
 * set is revealed.
 */
import { describe, expect, it } from 'vitest'
import type { FoundWordRow, FoundWordsWord } from './foundWords'
import { buildWordListRows } from './wordListRows'

const REQUIRED: FoundWordsWord[] = [
  { word: 'alpha', points: 1 },
  { word: 'bravo', points: 2 },
]
const BONUS: FoundWordsWord[] = [{ word: 'zulu', points: 9 }]

const found = (word: string, user = 'u1', at = '2026-01-01T00:00:00Z'): FoundWordRow => ({
  game_id: 'g',
  word,
  user_id: user,
  points: 1,
  is_bonus: false,
  found_at: at,
})

const words = (rows: { word: string }[]) => rows.map((r) => r.word)

describe('buildWordListRows', () => {
  it('shows only the found words while the game runs', () => {
    const rows = buildWordListRows({
      foundWords: [found('alpha')],
      requiredWords: REQUIRED,
      bonusWords: BONUS,
      hasBonus: true,
      isTerminal: false,
    })
    expect(words(rows)).toEqual(['alpha'])
    expect(rows[0]!.kind).toBe('found')
  })

  it('folds the missed words in at terminal, alphabetized under the found ones', () => {
    const rows = buildWordListRows({
      foundWords: [found('alpha')],
      requiredWords: REQUIRED,
      bonusWords: BONUS,
      hasBonus: true,
      isTerminal: true,
    })
    expect(words(rows)).toEqual(['alpha', 'bravo', 'zulu'])
    // The one they found stays theirs; the rest are the reveal.
    expect(rows.map((r) => r.kind)).toEqual(['found', 'unfound', 'unfound'])
  })

  it('reveals the required half alone on a board with no real bonus list', () => {
    const rows = buildWordListRows({
      foundWords: [found('alpha')],
      requiredWords: REQUIRED,
      bonusWords: BONUS,
      hasBonus: false,
      isTerminal: true,
    })
    expect(words(rows)).toEqual(['alpha', 'bravo'])
  })

  it('keeps every finder of a word several people found', () => {
    const rows = buildWordListRows({
      foundWords: [
        found('alpha', 'u2', '2026-01-01T00:00:02Z'),
        found('alpha', 'u1', '2026-01-01T00:00:01Z'),
      ],
      requiredWords: REQUIRED,
      bonusWords: BONUS,
      hasBonus: true,
      isTerminal: false,
    })
    expect(rows).toHaveLength(1)
    const row = rows[0]!
    expect(row.kind === 'found' && row.userId).toBe('u1') // earliest found_at
    expect(row.kind === 'found' && row.finderIds).toEqual(['u1', 'u2'])
  })
})
