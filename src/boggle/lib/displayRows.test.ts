import { describe, expect, it } from 'vitest'
import { buildDisplayRows } from './displayRows'
import type { FoundWordRow } from '../hooks/useGame'

const fw = (word: string, user_id: string, found_at: string, is_bonus = false): FoundWordRow => ({
  game_id: 'g', user_id, word, points: 1, is_bonus, found_at,
})
const words = (rows: ReturnType<typeof buildDisplayRows>) =>
  rows.map((r) => (r.kind === 'found' ? r.row.word : r.word))

describe('buildDisplayRows', () => {
  it('sorts alphabetically, each found word once', () => {
    expect(words(buildDisplayRows([fw('cat', 'a', '2'), fw('arc', 'b', '1')], null)))
      .toEqual(['arc', 'cat'])
  })

  it('dedups a word to its earliest finder', () => {
    const rows = buildDisplayRows([fw('cat', 'a', '2'), fw('cat', 'b', '1')], null)
    expect(rows).toHaveLength(1)
    expect(rows[0].kind === 'found' && rows[0].row.user_id).toBe('b') // earliest found_at wins
  })

  it('interleaves unfound reveal words; a found word shadows its reveal entry', () => {
    const rows = buildDisplayRows([fw('cat', 'a', '1')], [{ word: 'cat' }, { word: 'arc' }, { word: 'dog' }])
    expect(words(rows)).toEqual(['arc', 'cat', 'dog'])
    const kind = new Map(rows.map((r) => [r.kind === 'found' ? r.row.word : r.word, r.kind]))
    expect(kind.get('cat')).toBe('found')
    expect(kind.get('arc')).toBe('unfound')
  })
})
