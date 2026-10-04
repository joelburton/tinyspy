// cs-unmet

/**
 * Submitting a word, without mounting a board: a legal word answers at once and
 * goes to the server with its own points and flags, a refused one never does
 * and marks the tiles it used, and the claims live as long as their letters do.
 */
import { act, renderHook } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createFeedbackSlot } from '@/common/feedback/feedbackSlotStore'
import { ZTest_tilesOf } from '@/shared/bee-games/beeGameData.fixture'
import { ZTest_find, ZTest_word } from '../lib/gameData.fixture'
import { useSubmitWord } from './useSubmitWord'
import type { GFoundWord } from '../types'

const rpc = vi.hoisted(() => vi.fn())
vi.mock('../db', () => ({ db: { rpc } }))

const okEnvelope = (data: unknown) => ({
  data: { type: 'ok', data, outcome: null, severity: null, message: null },
  error: null,
})

/** The fixture words: a required one and a bonus one. */
const WORDS = [ZTest_word('bead', 1), ZTest_word('bcdfge', 6, { bonus: true })]
/** A board with the center `e` doubled on an outer tile — the twin a click can name. */
const TILES = ZTest_tilesOf('e', 'bacdfghe')
const TILES_BY_ID = new Map(TILES.map((t) => [t.id, t]))
const OUTER_E = TILES[8]!

function setup(foundWords: GFoundWord[] = []) {
  const slot = createFeedbackSlot('local')
  const shown = vi.spyOn(slot, 'show')
  const { result } = renderHook(() =>
    useSubmitWord({
      gameId: 'g1',
      words: WORDS,
      tilesById: TILES_BY_ID,
      foundWords,
      centerLetter: 'e',
      isMyTurn: true,
      localFeedbackSlot: slot,
    }),
  )
  const type = (word: string) => act(() => result.current.setWord(word))
  const submit = () => act(() => result.current.submit())
  return { result, shown, type, submit }
}

beforeEach(() => {
  rpc.mockReset()
  rpc.mockResolvedValue(okEnvelope({ result: 'accepted', points: 1 }))
})

describe('useSubmitWord', () => {
  it('a legal word answers at once and goes to the server with its points and flags', async () => {
    const { shown, type, submit } = setup()
    await type('bcdfge')
    await submit()
    expect(shown.mock.calls[0]![0].text).toBe('BCDFGE • — +6')
    expect(rpc).toHaveBeenCalledWith('submit_word', {
      p_game_id: 'g1', p_word: 'bcdfge', p_points: 6, p_is_pangram: false, p_is_bonus: true,
    })
  })

  it('a word missing the center is refused without a call, and marks the tiles it used', async () => {
    const { result, shown, type, submit } = setup()
    await type('bcdf')
    await submit()
    expect(rpc).not.toHaveBeenCalled()
    expect(shown.mock.calls[0]![0].text).toMatch(/missing "E"/)
    expect(result.current.refused?.value.counts).toEqual(new Map([['b', 1], ['c', 1], ['d', 1], ['f', 1]]))
  })

  it('a word already found is refused without a call', async () => {
    const found = { ...ZTest_find('u2', 'bead', 1), by: { id: 'u2' } } as unknown as GFoundWord
    const { shown, type, submit } = setup([found])
    await type('bead')
    await submit()
    expect(rpc).not.toHaveBeenCalled()
    expect(shown.mock.calls[0]![0].text).toMatch(/already found/i)
  })

  it('a click claims its tile, a Backspace at the end frees it, and a submit drops them all', async () => {
    const { result, submit } = setup()
    await act(() => result.current.addClickedTile(OUTER_E))
    expect(result.current.word).toBe('e')
    expect(result.current.claimedTileIds).toEqual([OUTER_E.id])

    await act(() => result.current.setWord((w) => w + 'd'))
    expect(result.current.claimedTileIds).toEqual([OUTER_E.id])
    await act(() => result.current.setWord('e'))
    expect(result.current.claimedTileIds).toEqual([OUTER_E.id])
    await act(() => result.current.setWord(''))
    expect(result.current.claimedTileIds).toEqual([])

    // A recall is a different word: its letters were never picked off the board.
    await act(() => result.current.addClickedTile(OUTER_E))
    await act(() => result.current.setWord('bead'))
    expect(result.current.claimedTileIds).toEqual([])

    await act(() => result.current.addClickedTile(OUTER_E))
    await submit()
    expect(result.current.claimedTileIds).toEqual([])
  })

  it("a refusal answers on the tiles the word had clicked", async () => {
    const { result, submit } = setup()
    await act(() => result.current.addClickedTile(OUTER_E))
    await act(() => result.current.setWord((w) => w + 'b'))
    await act(() => result.current.setWord((w) => w + 'd'))
    await submit() // 'ebd': too short, refused
    expect(result.current.refused?.value.claimedTileIds).toEqual([OUTER_E.id])
  })
})
