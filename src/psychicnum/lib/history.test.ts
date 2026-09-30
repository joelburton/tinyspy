// cs-blessed-psychicnum

/**
 * Unit test for the psychicnum turn-history replay (lib/history.ts). Pure — no
 * DOM, no supabase. Covers:
 *   1. INCLUSIVE folding — viewing a turn reflects every guess up to and including
 *      it, and NOT any later one.
 *   2. Hint / spoiler turns mark no tile and light nothing.
 *   3. The lit tile — exactly the word the viewed guess decided.
 *   4. Whose board — in compete a turn replays its own author's guesses alone.
 */
import { describe, expect, it } from 'vitest'
import { replayTurn } from './history'
import type { EventRow } from '../hooks/useGame'

function makeEvent(o: Partial<EventRow>): EventRow {
  return {
    id: 1, user_id: 'u', word: 'apple', is_correct: false,
    kind: 'guess', created_at: '2026-06-12T18:00:00Z', ...o,
  }
}

// Row 1: APPLE is a secret (correct). Row 2: a hint. Row 3: BERRY misses.
// The ids are what the viewer addresses, and they are deliberately NOT 0,1,2 —
// a builder that still indexed would pass these tests by accident.
const EVENTS: EventRow[] = [
  makeEvent({ id: 11, word: 'apple', is_correct: true, kind: 'guess' }),
  makeEvent({ id: 12, word: 'a fruit', kind: 'hint' }),
  makeEvent({ id: 13, word: 'berry', is_correct: false, kind: 'guess' }),
]

describe('replayTurn', () => {
  it('folds only guesses up to and including the viewed turn (inclusive)', () => {
    // At the first row only APPLE is decided; BERRY is not yet on the board.
    const first = replayTurn(EVENTS, 11, false)
    expect(first.tileResults.get('apple')).toBe(true)
    expect(first.tileResults.has('berry')).toBe(false)
    // At the last row both guesses are folded (the hint between adds nothing).
    const last = replayTurn(EVENTS, 13, false)
    expect(last.tileResults.get('apple')).toBe(true)
    expect(last.tileResults.get('berry')).toBe(false)
    expect(last.tileResults.size).toBe(2)
  })

  it('lights exactly the word the viewed guess decided', () => {
    expect(replayTurn(EVENTS, 11, false).litWord).toBe('apple')
    expect(replayTurn(EVENTS, 13, false).litWord).toBe('berry')
  })

  it('marks no tile and lights nothing for a hint / spoiler turn', () => {
    const hint = replayTurn(EVENTS, 12, false)
    expect(hint.litWord).toBeNull()
    // The hint added nothing — only APPLE (from the first row) is decided.
    expect(hint.tileResults.size).toBe(1)
    expect(hint.label).toBe('Hint: a fruit')
  })

  // The verdict words are the game's — the same "Correct" / "Wrong" the pill
  // and the log say — and the spoiler is called what its button is called.
  it('describes a guess by its verdict, a spoiler by the word it handed over', () => {
    expect(replayTurn(EVENTS, 11, false).label).toBe('APPLE — Correct')
    expect(replayTurn(EVENTS, 13, false).label).toBe('BERRY — Wrong')
    expect(replayTurn([makeEvent({ id: 7, word: 'cherry', kind: 'spoiler' })], 7, false).label).toBe(
      'Spoiler: CHERRY',
    )
  })

  it('an id that is not in the log folds nothing and names no author', () => {
    const missing = replayTurn(EVENTS, 99, false)
    expect(missing.tileResults.size).toBe(0)
    expect(missing.litWord).toBeNull()
    expect(missing.label).toBe('This turn')
    expect(missing.authorId).toBeNull()
  })

  it('in compete, replays the turn on its author\'s board alone', () => {
    // Two racers' rows, interleaved as the log holds them once the game ends.
    const race = [
      makeEvent({ id: 21, user_id: 'u1', word: 'apple', is_correct: true }),
      makeEvent({ id: 22, user_id: 'u2', word: 'berry', is_correct: false }),
      makeEvent({ id: 23, user_id: 'u2', word: 'cedar', is_correct: true }),
    ]
    const theirs = replayTurn(race, 23, true)
    expect([...theirs.tileResults]).toEqual([['berry', false], ['cedar', true]])
    expect(theirs.authorId).toBe('u2')
    // Coop is one shared board: the same turn folds every row before it.
    expect(replayTurn(race, 23, false).tileResults.size).toBe(3)
  })
})
