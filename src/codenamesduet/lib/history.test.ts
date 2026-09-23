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
import type { WordRow } from '../hooks/useBoard'
import type { ClueEvent, WordedGuess } from './events'

// A tiny fixed board — positions 0..4 with placeholder words. Reveal state starts
// clean; the snapshot recomputes it from the guess log.
const WORDS: WordRow[] = [
  { position: 0, word: 'ALPHA', revealed_as: null, neutral_a: false, neutral_b: false },
  { position: 1, word: 'BRAVO', revealed_as: null, neutral_a: false, neutral_b: false },
  { position: 2, word: 'CIDER', revealed_as: null, neutral_a: false, neutral_b: false },
  { position: 3, word: 'DELTA', revealed_as: null, neutral_a: false, neutral_b: false },
  { position: 4, word: 'EAGLE', revealed_as: null, neutral_a: false, neutral_b: false },
]

function guess(o: Partial<WordedGuess>): WordedGuess {
  return {
    kind: 'guess', id: 1, user_id: 'bea', took_turn: false,
    created_at: '2026-06-12T18:00:00Z', turn_number: 1, seat: 'B',
    guess_position: 0, guess_result: 'G', word: 'ALPHA', ...o,
  }
}

/** The clue a turn was given, for the banner's label. */
function clue(clue_word: string, clue_count: number): ClueEvent {
  return {
    kind: 'clue', id: 1, user_id: 'ada', took_turn: false,
    created_at: '2026-06-12T18:00:00Z', turn_number: 1, seat: 'A',
    clue_word, clue_count,
  }
}

const at = (words: WordRow[], pos: number) => words.find((w) => w.position === pos)!

describe('historySnapshot', () => {
  // Turn 1: B contacts ALPHA (green). Turn 2: A neutrals BRAVO. Turn 3: B hits
  // the assassin on CIDER.
  const guesses: WordedGuess[] = [
    guess({ id: 1, guess_position: 0, guess_result: 'G', seat: 'B', turn_number: 1 }),
    guess({ id: 2, guess_position: 1, guess_result: 'N', seat: 'A', turn_number: 2 }),
    guess({ id: 3, guess_position: 2, guess_result: 'A', seat: 'B', turn_number: 3 }),
  ]

  it('folds only guesses up to and including the viewed turn (inclusive)', () => {
    const snap = historySnapshot(WORDS, guesses, clue('x', 1), 2)
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
    expect(historySnapshot(WORDS, guesses, clue('bread', 2), 1).historyLabel).toBe(
      '#1: 2 BREAD → ALPHA',
    )
    expect(historySnapshot(WORDS, guesses, clue('wait', 1), 5).historyLabel).toBe(
      '#5: 1 WAIT — passed',
    )
  })
})
