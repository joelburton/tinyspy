// cs-unmet

/**
 * Submitting a word, without mounting a board: a legal word answers at once and
 * goes to the server with its own points and flags, a refused one never does
 * and marks its letters with the answer's outcome.
 */
import { act, renderHook } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createFeedbackSlot } from '@/common/feedback/feedbackSlotStore'
import { ZTest_find, ZTest_word } from '../lib/gameData.fixture'
import { useSubmitWord } from './useSubmitWord'
import type { GFoundWord } from '../types'

const rpc = vi.hoisted(() => vi.fn())
vi.mock('../db', () => ({ db: { rpc } }))

const okEnvelope = (data: unknown) => ({
  data: { type: 'ok', data, outcome: null, severity: null, message: null },
  error: null,
})

/** The fixture board, `abcdfg` around `e`, with a required word and a bonus one. */
const WORDS = [ZTest_word('bead', 1), ZTest_word('bcdfge', 6, { bonus: true })]
const LETTERS = new Set('abcdefg')

function setup(foundWords: GFoundWord[] = []) {
  const slot = createFeedbackSlot('local')
  const shown = vi.spyOn(slot, 'show')
  const { result } = renderHook(() =>
    useSubmitWord({
      gameId: 'g1',
      words: WORDS,
      foundWords,
      allowedLetters: LETTERS,
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

  it('a word missing the center is refused without a call, and its letters wear the answer', async () => {
    const { result, shown, type, submit } = setup()
    await type('bcdf')
    await submit()
    expect(rpc).not.toHaveBeenCalled()
    expect(shown.mock.calls[0]![0].text).toMatch(/missing "E"/)
    expect(result.current.refused?.value.letters).toEqual(new Set(['b', 'c', 'd', 'f']))
    expect(result.current.refused?.value.outcome).toBe(shown.mock.calls[0]![0].outcome)
  })

  it('a word already found is refused without a call', async () => {
    const found = { ...ZTest_find('u2', 'bead', 1), by: { id: 'u2' } } as unknown as GFoundWord
    const { shown, type, submit } = setup([found])
    await type('bead')
    await submit()
    expect(rpc).not.toHaveBeenCalled()
    expect(shown.mock.calls[0]![0].text).toMatch(/already found/i)
  })

  it('an accepted word leaves no refused mark', async () => {
    const { result, type, submit } = setup()
    await type('bead')
    await submit()
    expect(result.current.refused).toBeNull()
  })
})
