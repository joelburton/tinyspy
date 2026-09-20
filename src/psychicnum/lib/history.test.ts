// cs-blessed-psychicnum

/**
 * Unit test for the psychicnum turn-history snapshot (lib/history.ts). Pure — no
 * DOM, no supabase. Covers:
 *   1. INCLUSIVE folding — viewing a turn reflects every guess up to and including
 *      it, and NOT any later one.
 *   2. Hint / spoiler turns mark no tile and highlight nothing.
 *   3. The highlight — exactly the word the viewed guess decided.
 */
import { describe, expect, it } from 'vitest'
import { historySnapshot } from './history'
import type { EventRow } from '../hooks/useGame'

function g(o: Partial<EventRow>): EventRow {
  return {
    id: 1, user_id: 'u', word: 'apple', is_correct: false,
    kind: 'guess', created_at: '2026-06-12T18:00:00Z', ...o,
  }
}

// Row 1: APPLE is a secret (correct). Row 2: a hint. Row 3: BERRY misses.
// The ids are what the viewer addresses, and they are deliberately NOT 0,1,2 —
// a builder that still indexed would pass these tests by accident.
const GUESSES: EventRow[] = [
  g({ id: 11, word: 'apple', is_correct: true, kind: 'guess' }),
  g({ id: 12, word: 'a fruit', kind: 'hint' }),
  g({ id: 13, word: 'berry', is_correct: false, kind: 'guess' }),
]

describe('historySnapshot', () => {
  it('folds only guesses up to and including the viewed turn (inclusive)', () => {
    // At the first row only APPLE is decided; BERRY is not yet on the board.
    const s0 = historySnapshot(GUESSES, 11)
    expect(s0.results.get('apple')).toBe(true)
    expect(s0.results.has('berry')).toBe(false)
    // At the last row both guesses are folded (the hint between adds nothing).
    const s2 = historySnapshot(GUESSES, 13)
    expect(s2.results.get('apple')).toBe(true)
    expect(s2.results.get('berry')).toBe(false)
    expect(s2.results.size).toBe(2)
  })

  it('highlights exactly the word the viewed guess decided', () => {
    expect(historySnapshot(GUESSES, 11).historyLitWord).toBe('apple')
    expect(historySnapshot(GUESSES, 13).historyLitWord).toBe('berry')
  })

  it('marks no tile and highlights nothing for a hint / spoiler turn', () => {
    const s1 = historySnapshot(GUESSES, 12) // the hint
    expect(s1.historyLitWord).toBeNull()
    // The hint added nothing — only APPLE (from the first row) is decided.
    expect(s1.results.size).toBe(1)
    expect(s1.historyLabel).toBe('Hint: a fruit')
  })

  // The verdict words are the game's — the same "Correct" / "Wrong" the pill
  // and the log say — and the spoiler is called what its button is called.
  it('describes a guess by its verdict, a spoiler by the word it handed over', () => {
    expect(historySnapshot(GUESSES, 11).historyLabel).toBe('APPLE — Correct')
    expect(historySnapshot(GUESSES, 13).historyLabel).toBe('BERRY — Wrong')
    expect(historySnapshot([g({ id: 7, word: 'cherry', kind: 'spoiler' })], 7).historyLabel).toBe(
      'Spoiler: CHERRY',
    )
  })

  it('an id that is not in the list folds nothing', () => {
    // The compete case, and the reason the builder resolves rather than
    // indexes: a row the viewer cannot see is not a row it can replay.
    const s = historySnapshot(GUESSES, 99)
    expect(s.results.size).toBe(0)
    expect(s.historyLitWord).toBeNull()
    expect(s.historyLabel).toBe('This turn')
  })
})
