/**
 * Unit test for the connections turn-history snapshot (lib/history.ts). Pure — no
 * DOM, no supabase. Covers:
 *   1. STRICTLY-BEFORE folding — the snapshot's bands are the correct guesses BEFORE
 *      the viewed turn, so a viewed correct turn's own tiles are still on the grid.
 *   2. The highlight — exactly the four tiles the viewed turn guessed.
 *   3. The description — a correct turn names its category; the others carry the
 *      canonical copy.
 */
import { describe, expect, it } from 'vitest'
import { turnSnapshot } from './history'
import type { Board } from './board'
import type { GuessRow } from '../hooks/useGame'

const BOARD: Board = {
  categories: [
    { rank: 0, name: 'FRUIT', tiles: ['apple', 'pear', 'plum', 'lime'] },
    { rank: 1, name: 'METALS', tiles: ['iron', 'gold', 'lead', 'zinc'] },
    { rank: 2, name: 'COLORS', tiles: ['red', 'blue', 'teal', 'lime2'] },
    { rank: 3, name: 'DOGS', tiles: ['pug', 'boxer', 'corgi', 'lab'] },
  ],
  tileOrder: [
    'apple', 'pear', 'plum', 'lime', 'iron', 'gold', 'lead', 'zinc',
    'red', 'blue', 'teal', 'lime2', 'pug', 'boxer', 'corgi', 'lab',
  ],
}

function g(o: Partial<GuessRow>): GuessRow {
  return {
    id: 'id', user_id: 'u', tiles: ['apple', 'pear', 'plum', 'lime'],
    result: 'wrong', matched_category_rank: null, guessed_at: '2026-06-12T18:00:00Z', ...o,
  }
}

// Turn 0: correct FRUIT (rank 0). Turn 1: a wrong guess. Turn 2: correct METALS (rank 1).
const GUESSES: GuessRow[] = [
  g({ tiles: ['apple', 'pear', 'plum', 'lime'], result: 'correct', matched_category_rank: 0 }),
  g({ tiles: ['iron', 'gold', 'red', 'blue'], result: 'wrong' }),
  g({ tiles: ['iron', 'gold', 'lead', 'zinc'], result: 'correct', matched_category_rank: 1 }),
]

describe('turnSnapshot', () => {
  it('shows bands matched STRICTLY BEFORE the turn — the viewed turn stays on the grid', () => {
    // Turn 0 (the first correct): no earlier matches, so no bands — and FRUIT's tiles
    // are still on the grid (all 16), ready to be ringed.
    const s0 = turnSnapshot(GUESSES, BOARD, 0)
    expect(s0.matched).toHaveLength(0)
    expect(s0.tiles).toHaveLength(16)
    expect(s0.tiles).toContain('apple')

    // Turn 2 (the second correct): FRUIT (turn 0) is banded, but METALS (this turn)
    // is NOT yet — its tiles are still on the grid.
    const s2 = turnSnapshot(GUESSES, BOARD, 2)
    expect(s2.matched.map((m) => m.name)).toEqual(['FRUIT'])
    expect(s2.tiles).not.toContain('apple') // banded before this turn
    expect(s2.tiles).toContain('iron') // this turn's tile, still on the grid
  })

  it('highlights exactly the four tiles the viewed turn guessed', () => {
    expect([...turnSnapshot(GUESSES, BOARD, 1).highlightTiles].sort()).toEqual(
      ['blue', 'gold', 'iron', 'red'],
    )
    expect(turnSnapshot(GUESSES, BOARD, 1).outcome).toBe('wrong')
  })

  it('describes a correct turn by its category, the others by the canonical copy', () => {
    expect(turnSnapshot(GUESSES, BOARD, 0).description).toBe('Matched FRUIT')
    expect(turnSnapshot(GUESSES, BOARD, 1).description).toBe('Not a match')
    expect(turnSnapshot([g({ result: 'oneAway' })], BOARD, 0).description).toBe('One away!')
  })
})
