/**
 * Tests for the waffle print model.
 *
 * The judgment: a compete track must carry ONE player's board beside THAT
 * player's swaps. Printing a board next to a log that doesn't belong to it is
 * worse than printing nothing — it looks authoritative and is wrong. Plus the
 * solution, which is terminal-only on paper as on screen.
 */
import { describe, expect, it } from 'vitest'
import { buildWafflePrintModel } from './model'
import type { SwapRow } from '../hooks/useGame'

const MY_BOARD = 'badcef.g.hijklmn.o.pqrstu'

const swap = (over: Partial<SwapRow> & Pick<SwapRow, 'seq' | 'pos_a' | 'pos_b'>): SwapRow => ({
  user_id: 'u1', letter_a: 'a', letter_b: 'b', ...over,
})

const board = (user_id: string, over: Partial<{ board: string | null; colors: string | null; swaps_used: number; solved: boolean }> = {}) => ({
  user_id, board: MY_BOARD, colors: 'xxggg'.padEnd(25, 'g'), swaps_used: 2, solved: false, ...over,
})

const base = {
  brand: 'Waffle', gameTitle: 'Board 1', date: '1 Jan 2026',
  mode: 'compete' as const, isTerminal: false,
  maxSwaps: 12, parSwaps: 7,
  playerBoards: [board('u1'), board('u2')],
  swaps: [] as SwapRow[],
  players: [{ user_id: 'u1', username: 'me' }, { user_id: 'u2', username: 'moth' }],
  selfId: 'u1',
  solutionWords: ['ABCDE', 'FGHIJ'],
  answerShown: false,
  setup: [{ label: 'Extra swaps', value: '5' }],
}

describe('buildWafflePrintModel — the solution is a secret', () => {
  it('withholds it mid-game, even when handed it', () => {
    expect(buildWafflePrintModel({ ...base }).solutionWords).toBeNull()
  })

  it('withholds it on a LOST game — terminal is not enough', () => {
    // Same rule as wordle's: waffle hides the solution on a loss, and paper has
    // to hold the same line.
    expect(buildWafflePrintModel({ ...base, isTerminal: true }).solutionWords).toBeNull()
  })

  it('prints it once the answer is legitimately shown (solved or revealed)', () => {
    expect(
      buildWafflePrintModel({ ...base, isTerminal: true, answerShown: true }).solutionWords,
    ).toEqual(['ABCDE', 'FGHIJ'])
  })
})

describe('buildWafflePrintModel — the board', () => {
  it('prints holes as blank, letterless cells', () => {
    const m = buildWafflePrintModel({ ...base })
    // Holes are 6, 8, 16, 18 — not part of the puzzle, so no box and no letter.
    for (const h of [6, 8, 16, 18]) {
      expect(m.tracks[0].cells[h]).toEqual({ letter: '', state: 'blank', hole: true })
    }
  })

  it('keeps the 5×5 shape (holes included) so the waffle reads', () => {
    expect(buildWafflePrintModel({ ...base }).tracks[0].cells).toHaveLength(25)
  })
})

describe('buildWafflePrintModel — tracks', () => {
  it('coop is ONE shared track whose log names each swapper', () => {
    const m = buildWafflePrintModel({
      ...base, mode: 'coop',
      swaps: [swap({ user_id: 'u2', seq: 1, pos_a: 0, pos_b: 1 })],
    })
    expect(m.tracks).toHaveLength(1)
    expect(m.tracks[0].who).toBe('Team')
    expect(m.tracks[0].turns[0].who).toBe('moth')
  })

  it('compete mid-game prints ONLY my board', () => {
    expect(buildWafflePrintModel({ ...base }).tracks.map((t) => t.who)).toEqual(['You'])
  })

  it('compete at terminal gives each player their OWN swaps, not the pooled log', () => {
    const m = buildWafflePrintModel({
      ...base, isTerminal: true,
      swaps: [
        swap({ user_id: 'u1', seq: 1, pos_a: 0, pos_b: 1, letter_a: 'b', letter_b: 'a' }),
        swap({ user_id: 'u2', seq: 1, pos_a: 4, pos_b: 5, letter_a: 'e', letter_b: 'f' }),
        swap({ user_id: 'u1', seq: 2, pos_a: 2, pos_b: 3, letter_a: 'd', letter_b: 'c' }),
      ],
    })
    expect(m.tracks.map((t) => t.who)).toEqual(['me (you)', 'moth'])
    expect(m.tracks[0].turns).toHaveLength(2)
    expect(m.tracks[1].turns).toHaveLength(1)
    // A compete track is one person's, so the rows don't repeat their name.
    expect(m.tracks[0].turns[0].who).toBe('')
  })

  it('drops a player whose board the server withheld rather than printing an empty grid', () => {
    const m = buildWafflePrintModel({
      ...base, isTerminal: true,
      playerBoards: [board('u1')], // u2's row absent
    })
    expect(m.tracks.map((t) => t.who)).toEqual(['me (you)'])
  })

  it('reports each track’s own outcome', () => {
    const m = buildWafflePrintModel({
      ...base, isTerminal: true,
      playerBoards: [board('u1', { solved: true, swaps_used: 7 }), board('u2', { swaps_used: 12 })],
    })
    expect(m.tracks[0].result).toBe('Solved in 7 swaps')
    expect(m.tracks[1].result).toBe('12/12 swaps used')
  })
})
