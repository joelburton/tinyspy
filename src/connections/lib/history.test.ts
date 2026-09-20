// cs-met-connections

/**
 * Unit test for the connections turn-history snapshot (lib/history.ts). Pure — no
 * DOM, no supabase. Covers:
 *   1. STRICTLY-BEFORE folding — the snapshot's bands are the correct guesses BEFORE
 *      the viewed turn, so a viewed correct turn's own tiles are still on the grid.
 *   2. The highlight — exactly the four tiles the viewed turn guessed.
 *   3. The historyLabel — a correct turn names its category; the others carry the
 *      canonical text.
 */
import { describe, expect, it } from 'vitest'
import { historySnapshot } from './history'
import type { Board } from './board'
import type { EventRow } from '../hooks/useGame'

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

function g(o: Partial<EventRow>): EventRow {
  return {
    id: 1, user_id: 'u', tiles: ['apple', 'pear', 'plum', 'lime'],
    outcome: 'lost', result: 'wrong', matched: false, matched_category_rank: null, created_at: '2026-06-12T18:00:00Z', ...o,
  }
}

// Row 11: correct FRUIT (rank 0). Row 12: a wrong guess. Row 13: correct METALS
// (rank 1). The ids are what the viewer addresses, and are deliberately not
// 0,1,2 — a builder that still indexed would pass by accident.
const GUESSES: EventRow[] = [
  g({ id: 11, tiles: ['apple', 'pear', 'plum', 'lime'], outcome: 'won', result: 'correct', matched: true, matched_category_rank: 0 }),
  g({ id: 12, tiles: ['iron', 'gold', 'red', 'blue'], outcome: 'lost', result: 'wrong', matched: false }),
  g({ id: 13, tiles: ['iron', 'gold', 'lead', 'zinc'], outcome: 'won', result: 'correct', matched: true, matched_category_rank: 1 }),
]

describe('historySnapshot', () => {
  it('shows bands matched STRICTLY BEFORE the turn — the viewed turn stays on the grid', () => {
    // Turn 0 (the first correct): no earlier matches, so no bands — and FRUIT's tiles
    // are still on the grid (all 16), ready to be lit.
    const s0 = historySnapshot(GUESSES, BOARD, 11)
    expect(s0.matched).toHaveLength(0)
    expect(s0.tiles).toHaveLength(16)
    expect(s0.tiles).toContain('apple')

    // Turn 2 (the second correct): FRUIT (turn 0) is banded, but METALS (this turn)
    // is NOT yet — its tiles are still on the grid.
    const s2 = historySnapshot(GUESSES, BOARD, 13)
    expect(s2.matched.map((m) => m.name)).toEqual(['FRUIT'])
    expect(s2.tiles).not.toContain('apple') // banded before this turn
    expect(s2.tiles).toContain('iron') // this turn's tile, still on the grid
  })

  it('highlights exactly the four tiles the viewed turn guessed', () => {
    expect([...historySnapshot(GUESSES, BOARD, 12).historyLitTiles].sort()).toEqual(
      ['blue', 'gold', 'iron', 'red'],
    )
    expect(historySnapshot(GUESSES, BOARD, 12).result).toBe('wrong')
  })

  it('describes a correct turn by its category, the others by the canonical text', () => {
    expect(historySnapshot(GUESSES, BOARD, 11).historyLabel).toBe('Matched FRUIT')
    expect(historySnapshot(GUESSES, BOARD, 12).historyLabel).toBe('Not a match')
    expect(historySnapshot([g({ id: 7, outcome: 'near', result: 'oneAway', matched: false })], BOARD, 7).historyLabel).toBe('One away!')
  })

  it('an id these rows do not hold replays nothing', () => {
    // A compete opponent's guess, against your own board: nothing of theirs is
    // in this list, so the grid comes back untouched and no tiles are lit.
    const snap = historySnapshot(GUESSES, BOARD, 99)
    expect(snap.matched).toHaveLength(0)
    expect(snap.tiles).toHaveLength(16)
    expect(snap.historyLitTiles.size).toBe(0)
  })
})
