import { describe, expect, it } from 'vitest'
import type { FoundWordRow } from '../hooks/useGame'
import { buildDisplayRows } from './displayRows'

function fw(user_id: string, word: string): FoundWordRow {
  return {
    game_id: 'g',
    user_id,
    word,
    points: 1,
    is_pangram: false,
    is_bonus: false,
    found_at: '2026-01-01T00:00:00Z',
  }
}

describe('buildDisplayRows', () => {
  it('dedups a word BOTH players found to one self-colored row (the compete-reveal bug)', () => {
    // Post-terminal compete: RLS exposes the opponent's found_words too,
    // so 'bead' arrives twice. It must render once, in my color (cat A).
    const rows = buildDisplayRows([fw('ada', 'bead'), fw('bea', 'bead')], [], 'ada')
    expect(rows).toHaveLength(1)
    const r = rows[0]
    expect(r.kind).toBe('found')
    if (r.kind === 'found') {
      expect(r.category).toBe('a')
      expect(r.row.user_id).toBe('ada')
    }
  })

  it('prefers the self row regardless of input order', () => {
    const rows = buildDisplayRows([fw('bea', 'bead'), fw('ada', 'bead')], [], 'ada')
    expect(rows).toHaveLength(1)
    const r = rows[0]
    expect(r.kind === 'found' && r.row.user_id).toBe('ada')
  })

  it('keeps an opponent-only word as a cat-B row', () => {
    const rows = buildDisplayRows([fw('bea', 'face')], [], 'ada')
    expect(rows).toHaveLength(1)
    expect(rows[0]).toMatchObject({ kind: 'found', category: 'b' })
  })

  it('shadows a reveal entry with a found row of the same word', () => {
    const rows = buildDisplayRows(
      [fw('ada', 'bead')],
      [{ word: 'bead', points: 1, is_pangram: false }],
      'ada',
    )
    expect(rows).toHaveLength(1)
    expect(rows[0].kind).toBe('found')
  })

  it('includes unfound scoring words as cat-B unfound rows', () => {
    const rows = buildDisplayRows(
      [],
      [{ word: 'zzzz', points: 1, is_pangram: true }],
      'ada',
    )
    expect(rows).toEqual([{ kind: 'unfound', word: 'zzzz', isPangram: true }])
  })

  it('sorts alphabetically across found + unfound', () => {
    const rows = buildDisplayRows(
      [fw('ada', 'cead')],
      [{ word: 'aaaa', points: 1, is_pangram: false }],
      'ada',
    )
    const words = rows.map((r) => (r.kind === 'found' ? r.row.word : r.word))
    expect(words).toEqual(['aaaa', 'cead'])
  })
})
