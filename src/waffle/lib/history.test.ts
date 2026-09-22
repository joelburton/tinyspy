// cs-unmet

/**
 * The coop turn-history replay. Uses the same 21-distinct-letter reference board
 * as colors_test so the expected colors are easy to reason about:
 *   solution = 'abcdef.g.hijklmn.o.pqrstu'  (holes at 6,8,16,18)
 * A scramble two swaps from solved lets us check an intermediate state.
 */
import { describe, it, expect } from 'vitest'
import { historyBoardAfter, historySnapshot } from './history'
import type { EventRow } from '../hooks/useGame'

const SOLUTION = 'abcdef.g.hijklmn.o.pqrstu'
// Solution with cells 0↔1 and 2↔3 swapped → two swaps from solved.
const SCRAMBLE = 'badcef.g.hijklmn.o.pqrstu'

function swap(over: Partial<EventRow> & Pick<EventRow, 'id' | 'pos_a' | 'pos_b'>): EventRow {
  return { user_id: 'u1', letter_a: '?', letter_b: '?', colors: ALL_GREEN, ...over }
}

/** The colors of the solved board: every filled cell green, holes '.'. */
const ALL_GREEN = Array.from({ length: 25 }, (_, i) =>
  [6, 8, 16, 18].includes(i) ? '.' : 'g',
).join('')
/** …and of the board one swap earlier, where cells 0 and 1 are still swapped. */
const TWO_YELLOW = `yy${ALL_GREEN.slice(2)}`

// The solving sequence, in log order: fix cells 2↔3 first, then 0↔1. The ids
// are what the viewer addresses, and are deliberately not 0,1 — a builder that
// still indexed would pass by accident.
// Each row carries what the board scored AFTER it — the server wrote that at
// submit time, and the viewer reads it rather than working it out.
const SWAPS: EventRow[] = [
  swap({ id: 11, pos_a: 2, pos_b: 3, letter_a: 'd', letter_b: 'c', colors: TWO_YELLOW }),
  swap({ id: 12, pos_a: 0, pos_b: 1, letter_a: 'b', letter_b: 'a', colors: ALL_GREEN }),
]

describe('historyBoardAfter — inclusive replay', () => {
  it('applies swaps 0..index inclusive', () => {
    // After swap 0 (2↔3): cells 0,1 still scrambled, 2,3 fixed.
    expect(historyBoardAfter(SCRAMBLE, SWAPS, 0)).toBe('bacdef.g.hijklmn.o.pqrstu')
    // After swap 1 (0↔1 too): fully solved.
    expect(historyBoardAfter(SCRAMBLE, SWAPS, 1)).toBe(SOLUTION)
  })
})

describe('historySnapshot', () => {
  it('viewing the last swap shows the solved board, all green, with its cells ringed', () => {
    const snap = historySnapshot(SCRAMBLE, SWAPS, 12, 2)
    expect(snap.board).toBe(SOLUTION)
    // The colors are the ROW's — stored by submit_swap, not derived here.
    expect(snap.colors).toBe(ALL_GREEN)
    expect(snap.historyLitTiles).toEqual(new Set([0, 1]))
    expect(snap.historyLabel).toBe('#2: B (A1) ↔ A (B1)')
  })

  it('labels with the number it was GIVEN — the log numbers what it shows', () => {
    // Swap 12 sits second in this list; a log filtered to one player printed it
    // as "#1", and the banner echoes what the reader clicked.
    expect(historySnapshot(SCRAMBLE, SWAPS, 12, 1).historyLabel)
      .toBe('#1: B (A1) ↔ A (B1)')
    // No number at all when the opening carried none.
    expect(historySnapshot(SCRAMBLE, SWAPS, 12, null).historyLabel)
      .toBe('B (A1) ↔ A (B1)')
  })

  it('viewing an earlier swap shows the board AS OF that swap, colored for that state', () => {
    const snap = historySnapshot(SCRAMBLE, SWAPS, 11, 1)
    // Board after only the 2↔3 swap: cells 0,1 still wrong.
    expect(snap.board).toBe('bacdef.g.hijklmn.o.pqrstu')
    // Cells 0,1 yellow (in-word, wrong spot), everything else green.
    expect(snap.colors?.[0]).toBe('y')
    expect(snap.colors?.[1]).toBe('y')
    expect(snap.colors?.[2]).toBe('g')
    // The ringed cells are the ones THIS swap moved (2 and 3), not 0/1.
    expect(snap.historyLitTiles).toEqual(new Set([2, 3]))
  })

  it('carries the viewed row\u2019s own colors, not the latest', () => {
    // The two rows store different strings; picking the wrong one would show
    // the finished board's colors under an earlier board's letters.
    expect(historySnapshot(SCRAMBLE, SWAPS, 11, 1).colors).toBe(TWO_YELLOW)
    expect(historySnapshot(SCRAMBLE, SWAPS, 12, 2).colors).toBe(ALL_GREEN)
  })

  it('an id this list does not hold replays nothing', () => {
    // A compete opponent's swap, against your own board: none of it is here, so
    // the scramble comes back untouched rather than fully solved.
    const snap = historySnapshot(SCRAMBLE, SWAPS, 99, 1)
    expect(snap.board).toBe(SCRAMBLE)
    // No row, so no colors: the grid draws the scramble's letters uncolored
    // rather than a string belonging to some other board.
    expect(snap.colors).toBeNull()
    expect(snap.historyLitTiles.size).toBe(0)
    expect(snap.historyLabel).toBe('This swap')
  })
})

/**
 * Compete logs swaps too since 2026-08-02, so `waffle.events` can hold several
 * players' independent sequences. Replaying a MIXED list against one scramble
 * would apply an opponent's transpositions to my board and produce a state
 * nobody ever saw — so callers filter first (PlayArea's `replaySwaps`). These
 * pin what that filtering has to achieve.
 */
describe('compete: one player’s swaps at a time', () => {
  // Both players solve the same puzzle, so their rows interleave in the table:
  // one game-wide sequence of ids, two players' independent boards inside it.
  const MIXED: EventRow[] = [
    swap({ user_id: 'u1', id: 21, pos_a: 2, pos_b: 3, letter_a: 'd', letter_b: 'c' }),
    swap({ user_id: 'u2', id: 22, pos_a: 4, pos_b: 5, letter_a: 'e', letter_b: 'f' }),
    swap({ user_id: 'u1', id: 23, pos_a: 0, pos_b: 1, letter_a: 'b', letter_b: 'a' }),
    swap({ user_id: 'u2', id: 24, pos_a: 9, pos_b: 10, letter_a: 'i', letter_b: 'j' }),
  ]

  it('replays MY two swaps to the solved board', () => {
    const mine = MIXED.filter((s) => s.user_id === 'u1')
    expect(historyBoardAfter(SCRAMBLE, mine, mine.length - 1)).toBe(SOLUTION)
  })

  it('a MIXED list produces a board nobody played — the bug the filter prevents', () => {
    // Same scramble, same index, unfiltered: the opponent's 4↔5 and 9↔10 land on
    // my board too. Not a subtle difference — it is simply not my game state.
    expect(historyBoardAfter(SCRAMBLE, MIXED, MIXED.length - 1)).not.toBe(SOLUTION)
  })

  it('each player’s log replays independently from the same scramble', () => {
    const theirs = MIXED.filter((s) => s.user_id === 'u2')
    // u2 swapped 4↔5 (e↔f) then 9↔10 (h↔i), from the shared scramble.
    expect(historyBoardAfter(SCRAMBLE, theirs, theirs.length - 1)).toBe(
      'badcfe.g.ihjklmn.o.pqrstu',
    )
  })

  it('historySnapshot resolves the id against the FILTERED list', () => {
    const mine = MIXED.filter((s) => s.user_id === 'u1')
    const snap = historySnapshot(SCRAMBLE, mine, 21, 1)
    // My first swap is 2↔3 — NOT the opponent's 4↔5, which sits between them in
    // the unfiltered table.
    expect(snap.historyLitTiles).toEqual(new Set([2, 3]))
  })
})
