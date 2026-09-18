// cs-unmet

/**
 * Unit test for the psychicnum turn-history snapshot (lib/history.ts). Pure — no
 * DOM, no supabase. Covers:
 *   1. INCLUSIVE folding — viewing turn N reflects every guess with position ≤ N and
 *      NOT any later one.
 *   2. Hint / reveal turns mark no tile and highlight nothing.
 *   3. The highlight — exactly the word the viewed guess decided.
 */
import { describe, expect, it } from 'vitest'
import { historySnapshot } from './history'
import type { GuessRow } from '../hooks/useGame'

function g(o: Partial<GuessRow>): GuessRow {
  return {
    id: 1, user_id: 'u', word: 'apple', is_correct: false,
    kind: 'guess', created_at: '2026-06-12T18:00:00Z', ...o,
  }
}

// Turn 0: APPLE is a secret (correct). Turn 1: a hint. Turn 2: BERRY misses.
const GUESSES: GuessRow[] = [
  g({ word: 'apple', is_correct: true, kind: 'guess' }),
  g({ word: 'a fruit', kind: 'hint' }),
  g({ word: 'berry', is_correct: false, kind: 'guess' }),
]

describe('historySnapshot', () => {
  it('folds only guesses up to and including the viewed turn (inclusive)', () => {
    // At turn 0 only APPLE is decided; BERRY (turn 2) is not yet on the board.
    const s0 = historySnapshot(GUESSES, 0)
    expect(s0.results.get('apple')).toBe(true)
    expect(s0.results.has('berry')).toBe(false)
    // At turn 2 both guesses are folded (the hint at turn 1 adds nothing).
    const s2 = historySnapshot(GUESSES, 2)
    expect(s2.results.get('apple')).toBe(true)
    expect(s2.results.get('berry')).toBe(false)
    expect(s2.results.size).toBe(2)
  })

  it('highlights exactly the word the viewed guess decided', () => {
    expect(historySnapshot(GUESSES, 0).historyLitWord).toBe('apple')
    expect(historySnapshot(GUESSES, 2).historyLitWord).toBe('berry')
  })

  it('marks no tile and highlights nothing for a hint / reveal turn', () => {
    const s1 = historySnapshot(GUESSES, 1) // the hint
    expect(s1.historyLitWord).toBeNull()
    // The hint added nothing — only APPLE (from turn 0) is decided.
    expect(s1.results.size).toBe(1)
    expect(s1.historyLabel).toBe('Hint: a fruit')
  })

  it('describes a guess by its outcome, a spoiler by its answer', () => {
    expect(historySnapshot(GUESSES, 0).historyLabel).toBe('APPLE — a secret!')
    expect(historySnapshot(GUESSES, 2).historyLabel).toBe('BERRY — not a secret')
    expect(historySnapshot([g({ word: 'cherry', kind: 'spoiler' })], 0).historyLabel).toBe(
      'Revealed CHERRY',
    )
  })
})
