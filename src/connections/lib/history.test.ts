// cs-blessed-connections

/**
 * Unit test for the connections turn-history replay (lib/history.ts). Pure — no
 * DOM, no supabase. Covers:
 *   1. STRICTLY-BEFORE folding — the replay's bands are the correct guesses BEFORE
 *      the viewed turn, so a viewed correct turn's own tiles are still on the grid.
 *   2. The highlight — exactly the four tiles the viewed turn guessed.
 *   3. The label — a correct turn names its category; the others carry the
 *      canonical text.
 */
import { describe, expect, it } from 'vitest'
import { replayTurn } from './history'
import type { GEvent, GPlayer, GPuzzle } from '../types'

const PUZZLE: GPuzzle = {
  date: '2026-06-12',
  cats: [
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

const ME = { id: 'u', username: 'me', color: 'red' } as GPlayer

function g(o: Partial<GEvent>): GEvent {
  return {
    id: 1, by: ME, tiles: ['apple', 'pear', 'plum', 'lime'],
    outcome: 'lost', result: 'wrong', matched: false, matchedCatRank: null, at: '2026-06-12T18:00:00Z', ...o,
  }
}

// Row 11: correct FRUIT (rank 0). Row 12: a wrong guess. Row 13: correct METALS
// (rank 1). The ids are what the viewer addresses, and are deliberately not
// 0,1,2 — a builder that still indexed would pass by accident.
const GUESSES: GEvent[] = [
  g({ id: 11, tiles: ['apple', 'pear', 'plum', 'lime'], outcome: 'won', result: 'correct', matched: true, matchedCatRank: 0 }),
  g({ id: 12, tiles: ['iron', 'gold', 'red', 'blue'], outcome: 'lost', result: 'wrong', matched: false }),
  g({ id: 13, tiles: ['iron', 'gold', 'lead', 'zinc'], outcome: 'won', result: 'correct', matched: true, matchedCatRank: 1 }),
]

describe('replayTurn', () => {
  it('shows bands matched STRICTLY BEFORE the turn — the viewed turn stays on the grid', () => {
    // Turn 0 (the first correct): no earlier matches, so no bands — and FRUIT's tiles
    // are still on the grid (all 16), ready to be lit.
    const s0 = replayTurn(GUESSES, PUZZLE, 11)
    expect(s0.board.matchedCats).toHaveLength(0)
    expect(s0.board.tilesLeft).toHaveLength(16)
    expect(s0.board.tilesLeft).toContain('apple')

    // Turn 2 (the second correct): FRUIT (turn 0) is banded, but METALS (this turn)
    // is NOT yet — its tiles are still on the grid.
    const s2 = replayTurn(GUESSES, PUZZLE, 13)
    expect(s2.board.matchedCats.map((m) => m.name)).toEqual(['FRUIT'])
    expect(s2.board.matchedCats[0]!.matchedAt).toBe(GUESSES[0]!.at)
    expect(s2.board.tilesLeft).not.toContain('apple') // banded before this turn
    expect(s2.board.tilesLeft).toContain('iron') // this turn's tile, still on the grid
  })

  it('highlights exactly the four tiles the viewed turn guessed', () => {
    expect([...replayTurn(GUESSES, PUZZLE, 12).litTiles].sort()).toEqual(
      ['blue', 'gold', 'iron', 'red'],
    )
    expect(replayTurn(GUESSES, PUZZLE, 12).outcome).toBe('lost')
  })

  it('describes a correct turn by its category, the others by the canonical text', () => {
    expect(replayTurn(GUESSES, PUZZLE, 11).label).toBe('Matched FRUIT')
    expect(replayTurn(GUESSES, PUZZLE, 12).label).toBe('Not a match')
    expect(replayTurn([g({ id: 7, outcome: 'near', result: 'oneAway', matched: false })], PUZZLE, 7).label).toBe('One away!')
  })

  it('an id these rows do not hold replays nothing', () => {
    // A compete opponent's guess, against your own board: nothing of theirs is
    // in this list, so the grid comes back untouched and no tiles are lit.
    const snap = replayTurn(GUESSES, PUZZLE, 99)
    expect(snap.board.matchedCats).toHaveLength(0)
    expect(snap.board.tilesLeft).toHaveLength(16)
    expect(snap.litTiles.size).toBe(0)
  })
})
