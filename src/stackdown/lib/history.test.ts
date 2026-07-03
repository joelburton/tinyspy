import { describe, expect, it } from 'vitest'
import { turnSnapshot, type Submission } from './history'

/**
 * A four-turn log covering every kind the viewer must handle, in chronological
 * (submitted_at) order — the order the PlayArea passes it. Tile ids are arbitrary
 * small integers; the replay only unions/compares ids, never board geometry.
 *
 *   index 0  word  LEMON  valid    → clears tiles 10..14
 *   index 1  word  ZZZZZ  invalid  → clears nothing
 *   index 2  hint         (clue)   → clears nothing
 *   index 3  word  BOARD  valid    → clears tiles 20..24
 */
const log: Submission[] = [
  { kind: 'word', word: 'lemon', tile_ids: [10, 11, 12, 13, 14], valid: true },
  { kind: 'word', word: 'zzzzz', tile_ids: null, valid: false },
  { kind: 'hint', word: 'a citrus fruit', tile_ids: null, valid: null },
  { kind: 'word', word: 'board', tile_ids: [20, 21, 22, 23, 24], valid: true },
]

describe('turnSnapshot — offBoard (strictly-before boundary)', () => {
  it('the first turn has nothing removed yet', () => {
    expect(turnSnapshot(log, 0).offBoard).toEqual(new Set())
  })

  it("does NOT remove the viewed turn's own tiles (strictly before, not including)", () => {
    // Viewing index 0: LEMON's tiles are still on the board, ready to be ringed.
    const snap = turnSnapshot(log, 0)
    for (const id of [10, 11, 12, 13, 14]) expect(snap.offBoard.has(id)).toBe(false)
  })

  it('removes earlier valid words but skips invalid words and cheat requests', () => {
    // Viewing index 3 (BOARD): only LEMON (index 0) cleared tiles; the invalid word
    // (1) and the hint (2) cleared nothing, so BOARD's own tiles remain present.
    const snap = turnSnapshot(log, 3)
    expect(snap.offBoard).toEqual(new Set([10, 11, 12, 13, 14]))
  })
})

describe('turnSnapshot — greenTiles (only on a valid word)', () => {
  it("rings the viewed valid word's own tiles", () => {
    expect(turnSnapshot(log, 3).greenTiles).toEqual(new Set([20, 21, 22, 23, 24]))
  })
  it('rings nothing for a rejected attempt', () => {
    expect(turnSnapshot(log, 1).greenTiles).toEqual(new Set())
  })
  it('rings nothing for a hint request', () => {
    expect(turnSnapshot(log, 2).greenTiles).toEqual(new Set())
  })
})

describe('turnSnapshot — description (kind-aware)', () => {
  it('a valid word reads "Cleared WORD"', () => {
    expect(turnSnapshot(log, 0).description).toBe('Cleared LEMON')
  })
  it('a rejected word reads "Entered WORD — not a word"', () => {
    expect(turnSnapshot(log, 1).description).toBe('Entered ZZZZZ — not a word')
  })
  it('a hint shows its clue text', () => {
    expect(turnSnapshot(log, 2).description).toBe('Hint: a citrus fruit')
  })
  it('a reveal names the peeked word', () => {
    const reveal: Submission[] = [{ kind: 'reveal', word: 'lemon', tile_ids: null, valid: null }]
    expect(turnSnapshot(reveal, 0).description).toBe('Revealed LEMON')
  })
})

describe('turnSnapshot — coop interleaving (per-user seq would break; index does not)', () => {
  // Two players share one board; the log interleaves them chronologically. Each
  // player's own `seq` restarts at 1, so only the POSITION identifies a turn and
  // orders the shared board correctly.
  const coop: Submission[] = [
    { kind: 'word', word: 'lemon', tile_ids: [1, 2, 3, 4, 5], valid: true }, // player A, their seq 1
    { kind: 'word', word: 'board', tile_ids: [6, 7, 8, 9, 10], valid: true }, // player B, their seq 1
    { kind: 'word', word: 'crane', tile_ids: [11, 12, 13, 14, 15], valid: true }, // player A, their seq 2
  ]
  it('replays every earlier valid word regardless of who played it', () => {
    // Viewing the third row: BOTH LEMON and BOARD are already cleared, even though
    // they were played by different players (and share a per-user seq of 1).
    expect(turnSnapshot(coop, 2).offBoard).toEqual(new Set([1, 2, 3, 4, 5, 6, 7, 8, 9, 10]))
  })
})

describe('turnSnapshot — edge cases', () => {
  it('an out-of-range index still yields a well-defined offBoard and no green', () => {
    const snap = turnSnapshot(log, 99)
    // Every valid word is before index 99, so all their tiles are off.
    expect(snap.offBoard).toEqual(new Set([10, 11, 12, 13, 14, 20, 21, 22, 23, 24]))
    expect(snap.greenTiles).toEqual(new Set())
    expect(snap.description).toBe('This turn')
  })
})
