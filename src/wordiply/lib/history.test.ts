// cs-unmet

import { describe, expect, it } from 'vitest'
import { historySnapshot } from './history'
import type { EventRow } from '../hooks/useGame'

const row = (o: Partial<EventRow> & Pick<EventRow, 'id' | 'word'>): EventRow => ({
  game_id: 'g', user_id: 'u1', length: o.word.length, valid: true, reason: null,
  created_at: '2026-01-01T00:00:00Z', ...o,
})

// Two accepted words with a reject between them. The ids are what the viewer
// addresses, and are deliberately not 0, 1, 2.
const ROWS: EventRow[] = [
  row({ id: 11, word: 'hangars' }),
  row({ id: 12, word: 'arqq', valid: false, reason: 'not_a_word' }),
  row({ id: 13, word: 'arcs' }),
]

describe('wordiply historySnapshot', () => {
  it('fills a slot per ACCEPTED word up to and including the viewed row', () => {
    expect(historySnapshot(ROWS, 11).rows).toEqual([{ word: 'hangars', length: 7 }])
    expect(historySnapshot(ROWS, 13).rows).toEqual([
      { word: 'hangars', length: 7 },
      { word: 'arcs', length: 4 },
    ])
  })

  it('a reject shows the board WITHOUT it — it occupies no slot', () => {
    // The point of the viewer in this game: the board never says what was
    // tried, so a reject's row is the only place that moment exists.
    expect(historySnapshot(ROWS, 12).rows).toEqual([{ word: 'hangars', length: 7 }])
  })

  it('names the row by what it turned out to be', () => {
    expect(historySnapshot(ROWS, 11).historyLabel).toBe('HANGARS — 7 letters')
    expect(historySnapshot(ROWS, 12).historyLabel).toBe('ARQQ — not a word')
    expect(historySnapshot([row({ id: 7, word: 'ar', valid: false, reason: 'too_short' })], 7)
      .historyLabel).toBe('AR — too short')
    expect(historySnapshot([row({ id: 8, word: 'zzz', valid: false, reason: 'missing_base' })], 8)
      .historyLabel).toBe('ZZZ — no starter word')
  })

  it('an id this list does not hold replays nothing', () => {
    const snap = historySnapshot(ROWS, 99)
    expect(snap.rows).toEqual([])
    expect(snap.historyLabel).toBe('This guess')
  })
})
