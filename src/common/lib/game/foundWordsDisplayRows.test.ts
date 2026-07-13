import { describe, expect, it } from 'vitest'
import type { FoundWordRow } from './foundWords'
import { buildDisplayRows } from './foundWordsDisplayRows'

function fw(
  user_id: string,
  word: string,
  found_at = '2026-01-01T00:00:00Z',
): FoundWordRow {
  return {
    game_id: 'g',
    user_id,
    word,
    points: 1,
    is_pangram: false,
    is_bonus: false,
    found_at,
  }
}

describe('buildDisplayRows', () => {
  it('dedups a word multiple players found to one row, the FIRST finder', () => {
    // Post-terminal compete: RLS exposes everyone's found_words, so 'bead'
    // arrives twice. It shows once, attributed to whoever found it first
    // (earliest found_at) — that's whose color it renders in.
    const rows = buildDisplayRows(
      [
        fw('bea', 'bead', '2026-01-01T00:00:05Z'),
        fw('ada', 'bead', '2026-01-01T00:00:03Z'),
      ],
      [],
    )
    expect(rows).toHaveLength(1)
    expect(rows[0].kind).toBe('found')
    if (rows[0].kind === 'found') expect(rows[0].userId).toBe('ada')
  })

  it('picks the earliest finder regardless of input order', () => {
    const rows = buildDisplayRows(
      [
        fw('ada', 'bead', '2026-01-01T00:00:03Z'),
        fw('bea', 'bead', '2026-01-01T00:00:05Z'),
      ],
      [],
    )
    expect(rows[0].kind === 'found' && rows[0].userId).toBe('ada')
  })

  it('shadows a reveal entry with a found row of the same word', () => {
    const rows = buildDisplayRows(
      [fw('ada', 'bead')],
      [{ word: 'bead', points: 1, is_pangram: false }],
    )
    expect(rows).toHaveLength(1)
    expect(rows[0].kind).toBe('found')
  })

  it('includes unfound required words as unfound rows', () => {
    const rows = buildDisplayRows([], [{ word: 'zzzz', points: 1, is_pangram: true }])
    expect(rows).toEqual([{ kind: 'unfound', word: 'zzzz', isPangram: true }])
  })

  it('sorts alphabetically across found + unfound', () => {
    const rows = buildDisplayRows(
      [fw('ada', 'cead')],
      [{ word: 'aaaa', points: 1, is_pangram: false }],
    )
    const words = rows.map((r) => r.word)
    expect(words).toEqual(['aaaa', 'cead'])
  })
})
