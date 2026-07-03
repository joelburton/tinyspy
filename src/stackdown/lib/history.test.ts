import { describe, expect, it } from 'vitest'
import { turnSnapshot, type Submission } from './history'

/**
 * A four-turn log covering every kind the viewer must handle: two valid words
 * (which clear tiles), one rejected attempt, and one hint request. Tile ids are
 * arbitrary small integers — the replay only unions/compares ids, it never looks
 * at board geometry.
 *
 *   seq 1  word  LEMON  valid    → clears tiles 10..14
 *   seq 2  word  ZZZZZ  invalid  → clears nothing
 *   seq 3  hint         (clue)   → clears nothing
 *   seq 4  word  BOARD  valid    → clears tiles 20..24
 */
const log: Submission[] = [
  { seq: 1, kind: 'word', word: 'lemon', tile_ids: [10, 11, 12, 13, 14], valid: true },
  { seq: 2, kind: 'word', word: 'zzzzz', tile_ids: null, valid: false },
  { seq: 3, kind: 'hint', word: 'a citrus fruit', tile_ids: null, valid: null },
  { seq: 4, kind: 'word', word: 'board', tile_ids: [20, 21, 22, 23, 24], valid: true },
]

describe('turnSnapshot — offBoard (strictly-before boundary)', () => {
  it('the first turn has nothing removed yet', () => {
    expect(turnSnapshot(log, 1).offBoard).toEqual(new Set())
  })

  it("does NOT remove the viewed turn's own tiles (strictly <, not ≤)", () => {
    // Viewing turn 1: LEMON's tiles are still on the board, ready to be ringed.
    const snap = turnSnapshot(log, 1)
    for (const id of [10, 11, 12, 13, 14]) expect(snap.offBoard.has(id)).toBe(false)
  })

  it('removes earlier valid words but skips invalid words and cheat requests', () => {
    // Viewing turn 4: only LEMON (turn 1) cleared tiles; the invalid word (2) and
    // the hint (3) cleared nothing, so BOARD's own tiles (turn 4) remain present.
    const snap = turnSnapshot(log, 4)
    expect(snap.offBoard).toEqual(new Set([10, 11, 12, 13, 14]))
  })

  it('is order-independent (filters on seq, does not slice)', () => {
    const shuffled = [log[3], log[0], log[2], log[1]]
    expect(turnSnapshot(shuffled, 4).offBoard).toEqual(turnSnapshot(log, 4).offBoard)
  })
})

describe('turnSnapshot — greenTiles (only on a valid word)', () => {
  it("rings the viewed valid word's own tiles", () => {
    expect(turnSnapshot(log, 4).greenTiles).toEqual(new Set([20, 21, 22, 23, 24]))
  })
  it('rings nothing for a rejected attempt', () => {
    expect(turnSnapshot(log, 2).greenTiles).toEqual(new Set())
  })
  it('rings nothing for a hint request', () => {
    expect(turnSnapshot(log, 3).greenTiles).toEqual(new Set())
  })
})

describe('turnSnapshot — description (kind-aware)', () => {
  it('a valid word reads "Cleared WORD"', () => {
    expect(turnSnapshot(log, 1).description).toBe('Cleared LEMON')
  })
  it('a rejected word reads "Entered WORD — not a word"', () => {
    expect(turnSnapshot(log, 2).description).toBe('Entered ZZZZZ — not a word')
  })
  it('a hint shows its clue text', () => {
    expect(turnSnapshot(log, 3).description).toBe('Hint: a citrus fruit')
  })
  it('a reveal names the peeked word', () => {
    const reveal: Submission[] = [{ seq: 1, kind: 'reveal', word: 'lemon', tile_ids: null, valid: null }]
    expect(turnSnapshot(reveal, 1).description).toBe('Revealed LEMON')
  })
})

describe('turnSnapshot — edge cases', () => {
  it('an unknown seq still yields a well-defined offBoard and no green', () => {
    const snap = turnSnapshot(log, 99)
    // Every valid word is strictly before seq 99, so all their tiles are off.
    expect(snap.offBoard).toEqual(new Set([10, 11, 12, 13, 14, 20, 21, 22, 23, 24]))
    expect(snap.greenTiles).toEqual(new Set())
    expect(snap.description).toBe('This turn')
  })
})
