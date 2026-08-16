import { describe, expect, it } from 'vitest'
import { nextPendingSlot, stageBoard } from './staging'

describe('stageBoard', () => {
  it('empties only the slots whose card changed', () => {
    // The ordinary claim: three cards replaced in place, the rest untouched.
    const before = [10, 11, 12, 13, 14, 15]
    const after = [10, 99, 12, 98, 14, 97]
    expect(stageBoard(before, before, after)).toEqual([10, null, 12, null, 14, null])
  })

  it('leaves an unchanged board completely alone', () => {
    // Realtime refetches deliver the same board constantly; none of them may
    // blank a card.
    const board = [1, 2, 3, 4]
    expect(stageBoard(board, board, board)).toEqual(board)
  })

  it('shows the FIRST board at once, rather than dealing it out', () => {
    // Nothing is on screen until the game loads, so staging the opening twelve
    // would be a twelve-second wait before anyone can play.
    expect(stageBoard([], [], [1, 2, 3])).toEqual([1, 2, 3])
  })

  it('shows a wholesale replacement at once — a restart is not a claim', () => {
    // replay_board re-deals every card. More changed slots than a claim can
    // account for means this is a new board, not three cards arriving.
    expect(stageBoard([1, 2, 3, 4], [1, 2, 3, 4], [9, 8, 7, 6])).toEqual([9, 8, 7, 6])
  })

  it('keeps slots that are still waiting from an earlier deal', () => {
    // A second claim landing mid-deal must not "arrive" the card that was still
    // on its way in — and the pending empty must not be counted as a change,
    // which would read as a wholesale replacement and skip the staging.
    const prevBoard = [1, 42, 3]
    const shown = [1, null, 3]
    expect(stageBoard(shown, prevBoard, [1, 42, 55])).toEqual([1, null, null])
  })

  it('stages the new column when a deal GROWS the board', () => {
    expect(stageBoard([1, 2, 3], [1, 2, 3], [1, 2, 3, 7, 8, 9]))
      .toEqual([1, 2, 3, null, null, null])
  })

  it('stages a claim that ALSO grows the board — three replaced and three new', () => {
    // The regression. This is one claim on a table that had no set left: the
    // three claimed cards are replaced in place AND three more are appended.
    // Counting all six changed slots read as a wholesale replacement, so the
    // whole board snapped in at once — the one deal most worth watching.
    const before = [10, 11, 12, 13, 14, 15]
    const after = [10, 99, 12, 98, 14, 97, 70, 71, 72]
    expect(stageBoard(before, before, after))
      .toEqual([10, null, 12, null, 14, null, null, null, null])
  })

  it('still refuses a wholesale replacement that happens to grow', () => {
    // A restart is told apart by the cards replaced IN PLACE, so growing does
    // not smuggle one past the guard.
    expect(stageBoard([1, 2, 3, 4], [1, 2, 3, 4], [9, 8, 7, 6, 5, 4]))
      .toEqual([9, 8, 7, 6, 5, 4])
  })

  it('shrinks with the board when the deck is spent', () => {
    expect(stageBoard([1, 2, 3, 4, 5, 6], [1, 2, 3, 4, 5, 6], [1, 2, 3]))
      .toEqual([1, 2, 3])
  })
})

describe('nextPendingSlot', () => {
  it('finds the earliest empty slot', () => {
    expect(nextPendingSlot([1, null, 3, null])).toBe(1)
  })

  it('reports -1 once the deal has finished arriving', () => {
    expect(nextPendingSlot([1, 2, 3])).toBe(-1)
    expect(nextPendingSlot([])).toBe(-1)
  })
})
