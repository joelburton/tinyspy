// cs-met-codenamesduet

/**
 * Unit test for the codenamesduet turn-history snapshot (lib/history.ts). Pure —
 * no DOM, no supabase. Covers the three things the replay has to get right:
 *   1. INCLUSIVE folding — viewing turn N reflects every guess with turn ≤ N, and
 *      NOT any later turn's guesses.
 *   2. The per-seat neutral rule — a neutral sets only the guesser's own
 *      `neutral_a` / `neutral_b`, never the global `revealed_as`.
 *   3. `historyLitTiles` — exactly the positions guessed DURING the viewed turn.
 */
import { describe, expect, it } from 'vitest'
import { historySnapshot } from './history'
import type { GuessRow, WordRow } from '../hooks/useBoard'

// A tiny fixed board — positions 0..4 with placeholder words. Reveal state starts
// clean; the snapshot recomputes it from the guess log.
const WORDS: WordRow[] = [
  { position: 0, word: 'ALPHA', revealed_as: null, neutral_a: false, neutral_b: false },
  { position: 1, word: 'BRAVO', revealed_as: null, neutral_a: false, neutral_b: false },
  { position: 2, word: 'CIDER', revealed_as: null, neutral_a: false, neutral_b: false },
  { position: 3, word: 'DELTA', revealed_as: null, neutral_a: false, neutral_b: false },
  { position: 4, word: 'EAGLE', revealed_as: null, neutral_a: false, neutral_b: false },
]

function guess(o: Partial<GuessRow>): GuessRow {
  return {
    position: 0, word: 'ALPHA', guesser_seat: 'B', result: 'G',
    turn_number: 1, guessed_at: '2026-06-12T18:00:00Z', ...o,
  }
}

const at = (words: WordRow[], pos: number) => words.find((w) => w.position === pos)!

describe('historySnapshot', () => {
  // Turn 1: B contacts ALPHA (green). Turn 2: A neutrals BRAVO. Turn 3: B hits
  // the assassin on CIDER.
  const guesses: GuessRow[] = [
    guess({ position: 0, result: 'G', guesser_seat: 'B', turn_number: 1 }),
    guess({ position: 1, result: 'N', guesser_seat: 'A', turn_number: 2 }),
    guess({ position: 2, result: 'A', guesser_seat: 'B', turn_number: 3 }),
  ]

  it('folds only guesses up to and including the viewed turn (inclusive)', () => {
    const snap = historySnapshot(WORDS, guesses, { word: 'x', count: 1 }, 2)
    // Turn 1's green is in; turn 2's own neutral is in (inclusive); turn 3's
    // assassin is NOT yet.
    expect(at(snap.words, 0).revealed_as).toBe('G')
    expect(at(snap.words, 1).neutral_a).toBe(true)
    expect(at(snap.words, 2).revealed_as).toBeNull()
  })

  it('keeps a neutral per-seat — never global, only the guesser side', () => {
    const snap = historySnapshot(WORDS, guesses, null, 2)
    const bravo = at(snap.words, 1)
    expect(bravo.revealed_as).toBeNull() // a neutral is not a global reveal
    expect(bravo.neutral_a).toBe(true) // seat A guessed it as a bystander
    expect(bravo.neutral_b).toBe(false) // …seat B's direction stays open
  })

  it('lights exactly the positions decided during the viewed turn', () => {
    expect([...historySnapshot(WORDS, guesses, null, 1).historyLitTiles]).toEqual([0])
    expect([...historySnapshot(WORDS, guesses, null, 2).historyLitTiles]).toEqual([1])
    // Nothing decided on a turn with no guesses in the log.
    expect(historySnapshot(WORDS, guesses, null, 9).historyLitTiles.size).toBe(0)
  })

  it('describes the turn name-free: clue then guessed words, or "passed"', () => {
    expect(historySnapshot(WORDS, guesses, { word: 'bread', count: 2 }, 1).historyLabel).toBe(
      '#1: 2 BREAD → ALPHA',
    )
    expect(historySnapshot(WORDS, guesses, { word: 'wait', count: 1 }, 5).historyLabel).toBe(
      '#5: 1 WAIT — passed',
    )
  })
})
