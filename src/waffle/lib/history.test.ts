/**
 * The coop turn-history replay. Uses the same 21-distinct-letter reference board
 * as colors_test so the expected colors are easy to reason about:
 *   solution = 'abcdef.g.hijklmn.o.pqrstu'  (holes at 6,8,16,18)
 * A scramble two swaps from solved lets us check an intermediate state.
 */
import { describe, it, expect } from 'vitest'
import { boardAfter, turnSnapshot } from './history'
import type { SwapRow } from '../hooks/useGame'

const SOLUTION = 'abcdef.g.hijklmn.o.pqrstu'
// Solution with cells 0↔1 and 2↔3 swapped → two swaps from solved.
const SCRAMBLE = 'badcef.g.hijklmn.o.pqrstu'

function swap(over: Partial<SwapRow> & Pick<SwapRow, 'seq' | 'pos_a' | 'pos_b'>): SwapRow {
  return { user_id: 'u1', letter_a: '?', letter_b: '?', ...over }
}

// The solving sequence, in log order: fix cells 2↔3 first, then 0↔1.
const SWAPS: SwapRow[] = [
  swap({ seq: 1, pos_a: 2, pos_b: 3, letter_a: 'd', letter_b: 'c' }),
  swap({ seq: 2, pos_a: 0, pos_b: 1, letter_a: 'b', letter_b: 'a' }),
]

describe('boardAfter — inclusive replay', () => {
  it('applies swaps 0..index inclusive', () => {
    // After swap 0 (2↔3): cells 0,1 still scrambled, 2,3 fixed.
    expect(boardAfter(SCRAMBLE, SWAPS, 0)).toBe('bacdef.g.hijklmn.o.pqrstu')
    // After swap 1 (0↔1 too): fully solved.
    expect(boardAfter(SCRAMBLE, SWAPS, 1)).toBe(SOLUTION)
  })
})

describe('turnSnapshot', () => {
  it('viewing the last swap shows the solved board, all green, with its cells ringed', () => {
    const snap = turnSnapshot(SCRAMBLE, SOLUTION, SWAPS, 1)
    expect(snap.board).toBe(SOLUTION)
    // Solved → every filled cell green, holes '.'.
    expect(snap.colors).toBe(
      Array.from({ length: 25 }, (_, i) => ([6, 8, 16, 18].includes(i) ? '.' : 'g')).join(''),
    )
    expect(snap.highlight).toEqual(new Set([0, 1]))
    expect(snap.description).toBe('#2: B (A1) ↔ A (B1)')
  })

  it('viewing an earlier swap shows the board AS OF that swap, colored for that state', () => {
    const snap = turnSnapshot(SCRAMBLE, SOLUTION, SWAPS, 0)
    // Board after only the 2↔3 swap: cells 0,1 still wrong.
    expect(snap.board).toBe('bacdef.g.hijklmn.o.pqrstu')
    // Cells 0,1 yellow (in-word, wrong spot), everything else green.
    expect(snap.colors?.[0]).toBe('y')
    expect(snap.colors?.[1]).toBe('y')
    expect(snap.colors?.[2]).toBe('g')
    // The ringed cells are the ones THIS swap moved (2 and 3), not 0/1.
    expect(snap.highlight).toEqual(new Set([2, 3]))
  })

  it('no solution → letters replay but colors are null (graceful)', () => {
    const snap = turnSnapshot(SCRAMBLE, null, SWAPS, 1)
    expect(snap.board).toBe(SOLUTION)
    expect(snap.colors).toBeNull()
  })

  it('out-of-range index → clamps to all swaps applied, no highlight, neutral description', () => {
    const snap = turnSnapshot(SCRAMBLE, SOLUTION, SWAPS, 9)
    expect(snap.board).toBe(SOLUTION) // past the end → every swap applied
    expect(snap.highlight.size).toBe(0)
    expect(snap.description).toBe('This swap')
  })
})

/**
 * Compete logs swaps too since 2026-08-02, so `waffle.swaps` can hold several
 * players' independent sequences. Replaying a MIXED list against one scramble
 * would apply an opponent's transpositions to my board and produce a state
 * nobody ever saw — so callers filter first (PlayArea's `replaySwaps`). These
 * pin what that filtering has to achieve.
 */
describe('compete: one player’s swaps at a time', () => {
  // Both players solve the same puzzle, so their logs interleave in the table
  // and each counts its OWN seq from 1.
  const MIXED: SwapRow[] = [
    swap({ user_id: 'u1', seq: 1, pos_a: 2, pos_b: 3, letter_a: 'd', letter_b: 'c' }),
    swap({ user_id: 'u2', seq: 1, pos_a: 4, pos_b: 5, letter_a: 'e', letter_b: 'f' }),
    swap({ user_id: 'u1', seq: 2, pos_a: 0, pos_b: 1, letter_a: 'b', letter_b: 'a' }),
    swap({ user_id: 'u2', seq: 2, pos_a: 9, pos_b: 10, letter_a: 'i', letter_b: 'j' }),
  ]

  it('replays MY two swaps to the solved board', () => {
    const mine = MIXED.filter((s) => s.user_id === 'u1')
    expect(boardAfter(SCRAMBLE, mine, mine.length - 1)).toBe(SOLUTION)
  })

  it('a MIXED list produces a board nobody played — the bug the filter prevents', () => {
    // Same scramble, same index, unfiltered: the opponent's 4↔5 and 9↔10 land on
    // my board too. Not a subtle difference — it is simply not my game state.
    expect(boardAfter(SCRAMBLE, MIXED, MIXED.length - 1)).not.toBe(SOLUTION)
  })

  it('each player’s log replays independently from the same scramble', () => {
    const theirs = MIXED.filter((s) => s.user_id === 'u2')
    // u2 swapped 4↔5 (e↔f) then 9↔10 (h↔i), from the shared scramble.
    expect(boardAfter(SCRAMBLE, theirs, theirs.length - 1)).toBe(
      'badcfe.g.ihjklmn.o.pqrstu',
    )
  })

  it('turnSnapshot indexes the FILTERED list, so #N lines up with the row', () => {
    const mine = MIXED.filter((s) => s.user_id === 'u1')
    const snap = turnSnapshot(SCRAMBLE, SOLUTION, mine, 0)
    // My first swap is 2↔3 — NOT the opponent's 4↔5, which sits between them in
    // the unfiltered table.
    expect(snap.highlight).toEqual(new Set([2, 3]))
  })
})
