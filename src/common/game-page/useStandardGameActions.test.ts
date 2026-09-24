// cs-blessed-game-page

/**
 * Tests for useStandardGameActions — the End / Concede / Restart actions every
 * game binds through it. What each one IS lives in the registry; what this owns
 * is when each applies (a coop game offers End, a race offers Concede, both are
 * hidden at terminal) and what each does with the answer its RPC gives back.
 *
 * The confirmation is mocked: whether a question was asked is
 * `useBoundAction`'s subject. Which of these carries one is not uniform —
 * Restart at terminal goes straight through, and the case below says so.
 */

import { act, renderHook } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { useStandardGameActions } from './useStandardGameActions'
import { createFeedbackSlot } from '../feedback/feedbackSlotStore'

const askConfirmation = vi.fn(async (): Promise<'confirm' | 'alternative' | null> => 'confirm')
vi.mock('../floating-panels/confirmationService', () => ({
  askConfirmation: (...args: unknown[]) => askConfirmation(...(args as [])),
}))

/** Drain the action's async run (confirm → rpc → callback). */
const flush = () => act(async () => { await new Promise((r) => setTimeout(r, 0)) })

type Overrides = {
  isTerminal?: boolean
  mode?: 'coop' | 'compete'
  myConceded?: boolean
  confirmed?: boolean
  // What the question is answered with, for the two-ending case.
  answer?: 'confirm' | 'alternative' | null
}

/** The question that was asked — the mock's args are typed away, so the cast
 *  lives here once rather than at each assertion. */
function lastQuestion(): Record<string, unknown> {
  return (askConfirmation.mock.calls.at(-1) as unknown as [Record<string, unknown>])[0]
}

function setup(overrides: Overrides = {}) {
  const rpc = vi.fn().mockResolvedValue({ data: null, error: null })
  // A real slot with a spy on its one door, so a test can say both "it was
  // shown" and "as a notOk" without reaching into the rendered pill.
  const localFeedbackSlot = createFeedbackSlot('local')
  const shown = vi.spyOn(localFeedbackSlot, 'show')
  askConfirmation.mockResolvedValue(
    overrides.answer ?? (overrides.confirmed === false ? null : 'confirm'),
  )
  const { result } = renderHook(() =>
    useStandardGameActions({
      db: { rpc },
      gameId: 'g1',
      isTerminal: overrides.isTerminal ?? false,
      mode: overrides.mode ?? 'coop',
      myConceded: overrides.myConceded ?? false,
      localFeedbackSlot,
    }),
  )
  return { result, rpc, shown }
}

beforeEach(() => {
  askConfirmation.mockClear()
  askConfirmation.mockResolvedValue('confirm')
})

/** The two arms `concede` can answer with, as PostgREST hands them over. */
const CONCEDED_OK = {
  data: { type: 'ok', data: { result: 'conceded' }, outcome: null, severity: null,
          message: null, field: null, meta: null, dbcode: null, detail: null },
  error: null,
}
const ALREADY_CONCEDED = {
  // `outcome: 'noted'` is the raise's own choice, not the severity's default:
  // `race` alone reads as `warning`, and this is news rather than a setback.
  data: { type: 'not-ok', data: null, outcome: 'noted', severity: 'race',
          message: 'Already conceded', field: '_', meta: null,
          dbcode: 'PN483', detail: null },
  error: null,
}
const ENDED_OK = {
  data: { type: 'ok', data: { result: 'ended' }, outcome: null, severity: null,
          message: null, field: null, meta: null, dbcode: null, detail: null },
  error: null,
}
const REPLAYED_OK = {
  data: { type: 'ok', data: { result: 'replayed' }, outcome: null, severity: null,
          message: null, field: null, meta: null, dbcode: null, detail: null },
  error: null,
}

describe('which exit a game offers', () => {
  it('coop offers End and not Concede', () => {
    const { result } = setup({ mode: 'coop' })
    expect(result.current.actEndGame.describe('button').state).toBe('active')
    expect(result.current.actConcede.describe('button').state).toBe('hidden')
  })

  it('a race offers Concede and hides End', () => {
    const { result } = setup({ mode: 'compete' })
    expect(result.current.actConcede.describe('button').state).toBe('active')
    expect(result.current.actEndGame.describe('button').state).toBe('hidden')
  })

  it('a race puts BOTH endings behind Concede, not beside it', () => {
    // One row, one button, one key. The second ending lives inside the
    // question — which is where the difference between them gets explained.
    // Every race offers it (Joel, 2026-09-19).
    const { result } = setup({ mode: 'compete' })
    expect(result.current.actConcede.describe('button').state).toBe('active')
    expect(result.current.actConcede.describe('button').label).toBe('Concede / End game')
    expect(result.current.actEndGame.describe('button').state).toBe('hidden')
  })

  it('takes the exits away once the game is terminal', () => {
    // HIDDEN, not disabled: there is no race left to drop out of and no game
    // left to end, and `disabled` means "possible here, not right now".
    const { result } = setup({ mode: 'compete', isTerminal: true })
    expect(result.current.actConcede.describe('button').state).toBe('hidden')
    expect(result.current.actEndGame.describe('button').state).toBe('hidden')
  })

  it('keeps Restart off the BUTTON mid-game, while the menu and its key carry it', () => {
    // The one action that answers two askers differently: RESTART_CONFIRM is
    // written for mid-game use ("clears everyone's progress", "Keep playing"),
    // so the key must fire — but the info column's slots belong to playing.
    const { result } = setup()
    expect(result.current.actRestart.describe('button').state).toBe('hidden')
    expect(result.current.actRestart.describe('menu').state).toBe('active')
    expect(result.current.actRestart.describe('key').state).toBe('active')
  })

  it('hands the table stop BACK to a player who has already conceded', () => {
    // A decision, not an oversight (Joel, 2026-09-04): ending is the group
    // agreeing there is no result, and choosing it is freely open — a conceder
    // is still in the conversation. Their Concede is spent, and the question
    // that carried both endings went with it, so End comes back out on its own
    // — and Concede goes, so the row does not show two flags.
    const { result } = setup({ mode: 'compete', myConceded: true })
    expect(result.current.actConcede.describe('button').state).toBe('hidden')
    expect(result.current.actEndGame.describe('button').state).toBe('active')
  })

  it('offers Restart at terminal too — a replayed board is a legal thing to replay', () => {
    const { result } = setup({ isTerminal: true })
    expect(result.current.actRestart.describe('button').state).toBe('active')
  })
})

describe('endGame', () => {
  it('asks, then fires end_game', async () => {
    const { result, rpc } = setup()
    rpc.mockResolvedValue(ENDED_OK)
    act(() => result.current.actEndGame.run())
    await flush()
    expect(askConfirmation).toHaveBeenCalledTimes(1)
    expect(rpc).toHaveBeenCalledWith('end_game', { target_game: 'g1' })
  })

  it('does nothing if the question is answered no', async () => {
    const { result, rpc } = setup({ confirmed: false })
    act(() => result.current.actEndGame.run())
    await flush()
    expect(rpc).not.toHaveBeenCalled()
  })

  it('shows a not-ok into the local slot, as a notOk', async () => {
    const { result, rpc, shown } = setup()
    rpc.mockResolvedValue(ALREADY_CONCEDED)
    act(() => result.current.actEndGame.run())
    await flush()
    expect(shown).toHaveBeenCalledTimes(1)
    expect(shown.mock.calls[0]![0].kind).toBe('notOk')
  })

  it('says nothing on the ok arm — the terminal arrives by subscription', async () => {
    const { result, rpc, shown } = setup()
    rpc.mockResolvedValue(ENDED_OK)
    act(() => result.current.actEndGame.run())
    await flush()
    expect(shown).not.toHaveBeenCalled()
  })
})

describe('concede', () => {
  it('asks, then fires concede', async () => {
    const { result, rpc, shown } = setup({ mode: 'compete' })
    rpc.mockResolvedValue(CONCEDED_OK)
    act(() => result.current.actConcede.run())
    await flush()
    expect(askConfirmation).toHaveBeenCalledTimes(1)
    expect(rpc).toHaveBeenCalledWith('concede', { target_game: 'g1' })
    // The ok arm is silent: the conceded flag and any terminal arrive by
    // subscription, so there is nothing for the conceder to be told.
    expect(shown).not.toHaveBeenCalled()
  })

  it('surfaces the lost race — somebody else ended it, or I already conceded', async () => {
    const { result, rpc, shown } = setup({ mode: 'compete' })
    rpc.mockResolvedValue(ALREADY_CONCEDED)
    act(() => result.current.actConcede.run())
    await flush()
    expect(shown).toHaveBeenCalledTimes(1)
    expect(shown.mock.calls[0]![0].kind).toBe('notOk')
  })

  /**
   * The two endings behind one action. Which question gets asked is decided by
   * whether there is a body for the second one, and a race always has one.
   */
  describe('in a race', () => {
    it('asks the two-answer question, not the plain one', () => {
      const { result } = setup({ mode: 'compete' })
      act(() => result.current.actConcede.run())
      expect(lastQuestion()).toMatchObject({
        title: 'Concede, or end the game?',
        confirmLabel: 'Concede',
        alternativeLabel: 'End for all',
      })
    })

    it('fires end_game when the alternative is picked', async () => {
      const { result, rpc } = setup({ mode: 'compete', answer: 'alternative' })
      rpc.mockResolvedValue(ENDED_OK)
      act(() => result.current.actConcede.run())
      await flush()
      expect(rpc).toHaveBeenCalledWith('end_game', { target_game: 'g1' })
      expect(rpc).not.toHaveBeenCalledWith('concede', { target_game: 'g1' })
    })

    it('fires concede when the primary answer is picked', async () => {
      const { result, rpc } = setup({ mode: 'compete' })
      rpc.mockResolvedValue(CONCEDED_OK)
      act(() => result.current.actConcede.run())
      await flush()
      expect(rpc).toHaveBeenCalledWith('concede', { target_game: 'g1' })
    })
  })

})

describe('restart', () => {
  it('asks, then fires replay_board', async () => {
    const { result, rpc } = setup()
    rpc.mockResolvedValue(REPLAYED_OK)
    act(() => result.current.actRestart.run())
    await flush()
    expect(askConfirmation).toHaveBeenCalledTimes(1)
    expect(rpc).toHaveBeenCalledWith('replay_board', { target_game: 'g1' })
  })

  it('goes straight through at terminal — nothing left to interrupt', async () => {
    const { result, rpc } = setup({ isTerminal: true })
    rpc.mockResolvedValue(REPLAYED_OK)
    act(() => result.current.actRestart.run())
    await flush()
    expect(askConfirmation).not.toHaveBeenCalled()
    expect(rpc).toHaveBeenCalledWith('replay_board', { target_game: 'g1' })
  })

  it('says why when the board was NOT replayed', async () => {
    const { result, rpc, shown } = setup()
    rpc.mockResolvedValue(ALREADY_CONCEDED)
    act(() => result.current.actRestart.run())
    await flush()
    expect(shown).toHaveBeenCalledTimes(1)
  })

  it('drops a second press while the first is still out', async () => {
    // Nothing else stops a second wipe landing on a board someone has already
    // started guessing on — the single flight in the shared run is the guard.
    const { result, rpc } = setup()
    rpc.mockResolvedValue(REPLAYED_OK)
    act(() => {
      result.current.actRestart.run()
      result.current.actRestart.run()
    })
    await flush()
    expect(rpc).toHaveBeenCalledTimes(1)
  })
})
