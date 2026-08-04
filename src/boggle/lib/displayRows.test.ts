import { describe, expect, it } from 'vitest'
import { buildDisplayRows } from './displayRows'
import type { FoundWordRow } from '../hooks/useGame'

const fw = (word: string, user_id: string, found_at: string, is_bonus = false): FoundWordRow => ({
  game_id: 'g', user_id, word, points: 1, is_bonus, found_at,
})
const words = (rows: ReturnType<typeof buildDisplayRows>) => rows.map((r) => r.word)
/** A reveal entry. `is_bonus` says which shipped list it came from. */
const rw = (word: string, is_bonus = false) => ({ word, is_bonus })

describe('buildDisplayRows', () => {
  it('sorts alphabetically, each found word once', () => {
    expect(words(buildDisplayRows([fw('cat', 'a', '2'), fw('arc', 'b', '1')], null)))
      .toEqual(['arc', 'cat'])
  })

  it('dedups a word to its earliest finder', () => {
    const rows = buildDisplayRows([fw('cat', 'a', '2'), fw('cat', 'b', '1')], null)
    expect(rows).toHaveLength(1)
    expect(rows[0].kind === 'found' && rows[0].userId).toBe('b') // earliest found_at wins
    // …but BOTH finders are kept, or filtering the list to 'a' would hide a word
    // a genuinely found — b just got there first.
    expect(rows[0].kind === 'found' && rows[0].finderIds).toEqual(['b', 'a'])
  })

  it('tags unfound reveal entries with the list they came from', () => {
    // boggle reveals missed bonus words too, when the board has a wider legal
    // band; the KIND filter needs to tell the two apart.
    const rows = buildDisplayRows([], [rw('arc'), rw('zho', true)])
    expect(rows.map((r) => [r.word, r.isBonus])).toEqual([['arc', false], ['zho', true]])
  })

  it('interleaves unfound reveal words; a found word shadows its reveal entry', () => {
    const rows = buildDisplayRows([fw('cat', 'a', '1')], [rw('cat'), rw('arc'), rw('dog')])
    expect(words(rows)).toEqual(['arc', 'cat', 'dog'])
    const kind = new Map(rows.map((r) => [r.word, r.kind]))
    expect(kind.get('cat')).toBe('found')
    expect(kind.get('arc')).toBe('unfound')
  })
})
