// cs-blessed-game-page

/**
 * Tests for useStandardGameActions — the End / Concede / Restart actions every
 * game binds through it. What each one IS lives in the registry; what this owns
 * is when each applies (a coop game offers End, a race offers Concede, both are
 * hidden once the game ends) and what each does with the answer its RPC gives back.
 *
 * The confirmation is mocked: whether a question was asked is
 * `useBindAction`'s subject. Which of these carries one is not uniform —
 * Restart after the end goes straight through, and the case below says so.
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
  isGameEnded?: boolean
  mode?: 'coop' | 'compete'
  isPlayerEnded?: boolean
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
      isGameEnded: overrides.isGameEnded ?? false,
      mode: overrides.mode ?? 'coop',
      isPlayerEnded: overrides.isPlayerEnded ?? false,
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
  data: { type: 'not-ok', data: null, outcome: null, severity: 'race',
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
  it('coop offers Stop and not Concede', () => {
    const { result } = setup({ mode: 'coop' })
    expect(result.current.actStopGame.describe('button').state).toBe('active')
    expect(result.current.actConcede.describe('button').state).toBe('hidden')
  })

  it('a race offers Concede and hides Stop', () => {
    const { result } = setup({ mode: 'compete' })
    expect(result.current.actConcede.describe('button').state).toBe('active')
    expect(result.current.actStopGame.describe('button').state).toBe('hidden')
  })

  it('a race puts BOTH endings behind Concede, not beside it', () => {
    // One row, one button, one key. The second ending lives inside the
    // question — which is where the difference between them gets explained.
    // Every race offers it (Joel, 2026-09-19).
    const { result } = setup({ mode: 'compete' })
    expect(result.current.actConcede.describe('button').state).toBe('active')
    expect(result.current.actConcede.describe('button').label).toBe('Concede / Stop game')
    expect(result.current.actStopGame.describe('button').state).toBe('hidden')
  })

  it('takes the exits away once the game has ended', () => {
    // HIDDEN, not disabled: there is no race left to drop out of and no game
    // left to end, and `disabled` means "possible here, not right now".
    const { result } = setup({ mode: 'compete', isGameEnded: true })
    expect(result.current.actConcede.describe('button').state).toBe('hidden')
    expect(result.current.actStopGame.describe('button').state).toBe('hidden')
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

  it('hands the table stop BACK to a racer who is out — conceded, lost, or finished', () => {
    // Anyone in a game may stop it for all (Joel, 2026-09-04 and 2026-09-24):
    // stopping is the group agreeing there is no result, and a player who is out
    // is still in the conversation. Conceding is not open to them — a conceder
    // has, a player who lost has nothing to concede, and a finisher would only
    // throw away a win they may hold — so Stop comes out on its own.
    const { result } = setup({ mode: 'compete', isPlayerEnded: true })
    expect(result.current.actConcede.describe('button').state).toBe('hidden')
    expect(result.current.actStopGame.describe('button').state).toBe('active')
  })

  it('never shows two flags, nor a disabled one', () => {
    // Stop and Concede share the flag and ⌥⌫: at most one is ever on screen, and
    // a flag that is there can be pressed.
    for (const mode of ['coop', 'compete'] as const) {
      for (const isGameEnded of [false, true]) {
        for (const isPlayerEnded of [false, true]) {
          const { result } = setup({ mode, isGameEnded, isPlayerEnded })
          const shown = [result.current.actStopGame, result.current.actConcede]
            .map((a) => a.describe('button').state)
            .filter((s) => s !== 'hidden')
          expect(shown.length, `${mode} ended=${isGameEnded} out=${isPlayerEnded}`).toBeLessThanOrEqual(1)
          expect(shown).not.toContain('disabled')
        }
      }
    }
  })

  it('offers Restart after the end too — a replayed board is a legal thing to replay', () => {
    const { result } = setup({ isGameEnded: true })
    expect(result.current.actRestart.describe('button').state).toBe('active')
  })
})

describe('stopGame', () => {
  it('asks, then fires stop_game', async () => {
    const { result, rpc } = setup()
    rpc.mockResolvedValue(ENDED_OK)
    act(() => result.current.actStopGame.run())
    await flush()
    expect(askConfirmation).toHaveBeenCalledTimes(1)
    expect(rpc).toHaveBeenCalledWith('stop_game', { p_game_id: 'g1' })
  })

  it('does nothing if the question is answered no', async () => {
    const { result, rpc } = setup({ confirmed: false })
    act(() => result.current.actStopGame.run())
    await flush()
    expect(rpc).not.toHaveBeenCalled()
  })

  it('shows a not-ok into the local slot, as a notOk', async () => {
    const { result, rpc, shown } = setup()
    rpc.mockResolvedValue(ALREADY_CONCEDED)
    act(() => result.current.actStopGame.run())
    await flush()
    expect(shown).toHaveBeenCalledTimes(1)
    expect(shown.mock.calls[0]![0].kind).toBe('notOk')
  })

  it('says nothing on the ok arm — the ending arrives by subscription', async () => {
    const { result, rpc, shown } = setup()
    rpc.mockResolvedValue(ENDED_OK)
    act(() => result.current.actStopGame.run())
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
    expect(rpc).toHaveBeenCalledWith('concede', { p_game_id: 'g1' })
    // The ok arm is silent: the conceded flag and any ending arrive by
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
   * The two endings behind one action: Concede's question offers both.
   */
  describe('in a race', () => {
    it('asks the two-answer question', () => {
      const { result } = setup({ mode: 'compete' })
      act(() => result.current.actConcede.run())
      expect(lastQuestion()).toMatchObject({
        title: 'Concede, or stop the game?',
        confirmLabel: 'Concede',
        alternativeLabel: 'Stop for all',
      })
    })

    it('fires stop_game when the alternative is picked', async () => {
      const { result, rpc } = setup({ mode: 'compete', answer: 'alternative' })
      rpc.mockResolvedValue(ENDED_OK)
      act(() => result.current.actConcede.run())
      await flush()
      expect(rpc).toHaveBeenCalledWith('stop_game', { p_game_id: 'g1' })
      expect(rpc).not.toHaveBeenCalledWith('concede', { p_game_id: 'g1' })
    })

    it('fires concede when the primary answer is picked', async () => {
      const { result, rpc } = setup({ mode: 'compete' })
      rpc.mockResolvedValue(CONCEDED_OK)
      act(() => result.current.actConcede.run())
      await flush()
      expect(rpc).toHaveBeenCalledWith('concede', { p_game_id: 'g1' })
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
    expect(rpc).toHaveBeenCalledWith('replay_board', { p_game_id: 'g1' })
  })

  it('goes straight through once the game has ended — nothing left to interrupt', async () => {
    const { result, rpc } = setup({ isGameEnded: true })
    rpc.mockResolvedValue(REPLAYED_OK)
    act(() => result.current.actRestart.run())
    await flush()
    expect(askConfirmation).not.toHaveBeenCalled()
    expect(rpc).toHaveBeenCalledWith('replay_board', { p_game_id: 'g1' })
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
