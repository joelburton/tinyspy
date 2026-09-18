// cs-unmet

import { describe, expect, it } from 'vitest'
import { historySnapshot, type Submission } from './history'

/**
 * A four-event log covering every kind the viewer must handle, in `id` order —
 * the order the PlayArea passes it. Tile ids are arbitrary
 * small integers; the replay only unions/compares ids, never board geometry.
 *
 *   index 0  word  LEMON  valid    → clears tiles 10..14
 *   index 1  word  ZZZZZ  invalid  → clears nothing
 *   index 2  hint         (clue)   → clears nothing
 *   index 3  word  BOARD  valid    → clears tiles 20..24
 */
// The ids are what the viewer addresses, and are deliberately not 0..3 — a
// builder that still indexed would pass these by accident.
const log: Submission[] = [
  { id: 11, kind: 'word', word: 'lemon', tile_ids: [10, 11, 12, 13, 14], valid: true },
  { id: 12, kind: 'word', word: 'zzzzz', tile_ids: null, valid: false },
  { id: 13, kind: 'hint', word: 'a citrus fruit', tile_ids: null, valid: null },
  { id: 14, kind: 'word', word: 'board', tile_ids: [20, 21, 22, 23, 24], valid: true },
]

describe('historySnapshot — offBoard (strictly-before boundary)', () => {
  it('the first turn has nothing removed yet', () => {
    expect(historySnapshot(log, 11).offBoard).toEqual(new Set())
  })

  it("does NOT remove the viewed turn's own tiles (strictly before, not including)", () => {
    // Viewing index 0: LEMON's tiles are still on the board, ready to be ringed.
    const snap = historySnapshot(log, 11)
    for (const id of [10, 11, 12, 13, 14]) expect(snap.offBoard.has(id)).toBe(false)
  })

  it('removes earlier valid words but skips invalid words and cheat requests', () => {
    // Viewing index 3 (BOARD): only LEMON (index 0) cleared tiles; the invalid word
    // (1) and the hint (2) cleared nothing, so BOARD's own tiles remain present.
    const snap = historySnapshot(log, 14)
    expect(snap.offBoard).toEqual(new Set([10, 11, 12, 13, 14]))
  })
})

describe('historySnapshot — historyLitTiles (only on a valid word)', () => {
  it("rings the viewed valid word's own tiles", () => {
    expect(historySnapshot(log, 14).historyLitTiles).toEqual(new Set([20, 21, 22, 23, 24]))
  })
  it('rings nothing for a rejected attempt', () => {
    expect(historySnapshot(log, 12).historyLitTiles).toEqual(new Set())
  })
  it('rings nothing for a hint request', () => {
    expect(historySnapshot(log, 13).historyLitTiles).toEqual(new Set())
  })
})

describe('historySnapshot — historyLabel (kind-aware)', () => {
  it('a valid word reads "Cleared WORD"', () => {
    expect(historySnapshot(log, 11).historyLabel).toBe('Cleared LEMON')
  })
  it('a rejected word reads "Entered WORD — not a word"', () => {
    expect(historySnapshot(log, 12).historyLabel).toBe('Entered ZZZZZ — not a word')
  })
  it('a hint shows its clue text', () => {
    expect(historySnapshot(log, 13).historyLabel).toBe('Hint: a citrus fruit')
  })
  it('a spoiler names the word it handed over', () => {
    const reveal: Submission[] = [{ id: 9, kind: 'spoiler', word: 'lemon', tile_ids: null, valid: null }]
    expect(historySnapshot(reveal, 9).historyLabel).toBe('Revealed LEMON')
  })
})

describe('historySnapshot — coop interleaving', () => {
  // Two players share one board and the log interleaves them chronologically.
  // The row's own id is what names a turn and what orders the shared board.
  const coop: Submission[] = [
    { id: 21, kind: 'word', word: 'lemon', tile_ids: [1, 2, 3, 4, 5], valid: true }, // player A
    { id: 22, kind: 'word', word: 'board', tile_ids: [6, 7, 8, 9, 10], valid: true }, // player B
    { id: 23, kind: 'word', word: 'crane', tile_ids: [11, 12, 13, 14, 15], valid: true }, // player A
  ]
  it('replays every earlier valid word regardless of who played it', () => {
    // Viewing the third row: BOTH LEMON and BOARD are already cleared, even though
    // they were played by different players — a coop board is one board.
    expect(historySnapshot(coop, 23).offBoard).toEqual(new Set([1, 2, 3, 4, 5, 6, 7, 8, 9, 10]))
  })
})

describe('historySnapshot — edge cases', () => {
  it('an id this list does not hold replays nothing', () => {
    // A compete opponent's word, against your own board: there is nothing of
    // theirs here, so the board is whole and nothing is ringed.
    const snap = historySnapshot(log, 99)
    expect(snap.offBoard).toEqual(new Set())
    expect(snap.historyLitTiles).toEqual(new Set())
    expect(snap.historyLabel).toBe('This turn')
  })
})
