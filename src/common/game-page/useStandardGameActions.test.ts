// cs-unmet

/**
 * Tests for useStandardGameActions — the End / Concede / Restart actions every
 * game binds through it. What each one IS lives in the registry; what this owns
 * is when each applies (a coop game offers End, a race offers Concede, both go
 * disabled at terminal) and what each does with the answer its RPC gives back.
 *
 * The confirmation is mocked: whether a question was asked is
 * `useBoundAction`'s subject, and every action here has one.
 */

import { act, renderHook } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { useStandardGameActions } from './useStandardGameActions'

const askConfirmation = vi.fn(async () => true)
vi.mock('../floating-panels/confirmationService', () => ({
  askConfirmation: (...args: unknown[]) => askConfirmation(...(args as [])),
}))

/** Drain the action's async run (confirm → rpc → callback). */
const flush = () => act(async () => { await new Promise((r) => setTimeout(r, 0)) })

type Overrides = {
  isTerminal?: boolean
  mode?: 'coop' | 'compete'
  myConceded?: boolean
  offerEndInCompete?: boolean
  confirmed?: boolean
}

function setup(overrides: Overrides = {}) {
  const rpc = vi.fn().mockResolvedValue({ data: null, error: null })
  const showError = vi.fn()
  const onRestarted = vi.fn()
  askConfirmation.mockResolvedValue(overrides.confirmed ?? true)
  const { result } = renderHook(() =>
    useStandardGameActions({
      db: { rpc },
      gameId: 'g1',
      isTerminal: overrides.isTerminal ?? false,
      mode: overrides.mode ?? 'coop',
      myConceded: overrides.myConceded ?? false,
      offerEndInCompete: overrides.offerEndInCompete,
      showError,
      onRestarted,
    }),
  )
  return { result, rpc, showError, onRestarted }
}

beforeEach(() => {
  askConfirmation.mockClear()
  askConfirmation.mockResolvedValue(true)
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
    expect(result.current.actEndGame.describe().state).toBe('active')
    expect(result.current.actConcede.describe().state).toBe('hidden')
  })

  it('a race offers Concede and hides End', () => {
    const { result } = setup({ mode: 'compete' })
    expect(result.current.actConcede.describe().state).toBe('active')
    expect(result.current.actEndGame.describe().state).toBe('hidden')
  })

  it('a race that opts in offers both', () => {
    const { result } = setup({ mode: 'compete', offerEndInCompete: true })
    expect(result.current.actConcede.describe().state).toBe('active')
    expect(result.current.actEndGame.describe().state).toBe('active')
  })

  it('disables both exits once the game is terminal', () => {
    const { result } = setup({ mode: 'compete', isTerminal: true, offerEndInCompete: true })
    expect(result.current.actConcede.describe().state).toBe('disabled')
    expect(result.current.actEndGame.describe().state).toBe('disabled')
  })

  it('disables Concede for a player who has already conceded, and leaves End alone', () => {
    // A decision, not an oversight (Joel, 2026-09-04): ending is the group
    // agreeing there is no result, and choosing it is freely open — a conceder
    // is still in the conversation.
    const { result } = setup({ mode: 'compete', myConceded: true, offerEndInCompete: true })
    expect(result.current.actConcede.describe().state).toBe('disabled')
    expect(result.current.actEndGame.describe().state).toBe('active')
  })

  it('offers Restart at terminal too — a replayed board is a legal thing to replay', () => {
    const { result } = setup({ isTerminal: true })
    expect(result.current.actRestart.describe().state).toBe('active')
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

  it('surfaces a not-ok as a sticky pill', async () => {
    const { result, rpc, showError } = setup()
    rpc.mockResolvedValue(ALREADY_CONCEDED)
    act(() => result.current.actEndGame.run())
    await flush()
    expect(showError).toHaveBeenCalledTimes(1)
    expect(showError.mock.calls[0]![0]).toMatchObject({ mode: { kind: 'sticky' } })
  })

  it('says nothing on the ok arm — the terminal arrives by subscription', async () => {
    const { result, rpc, showError } = setup()
    rpc.mockResolvedValue(ENDED_OK)
    act(() => result.current.actEndGame.run())
    await flush()
    expect(showError).not.toHaveBeenCalled()
  })
})

describe('concede', () => {
  it('asks, then fires concede', async () => {
    const { result, rpc, showError } = setup({ mode: 'compete' })
    rpc.mockResolvedValue(CONCEDED_OK)
    act(() => result.current.actConcede.run())
    await flush()
    expect(askConfirmation).toHaveBeenCalledTimes(1)
    expect(rpc).toHaveBeenCalledWith('concede', { target_game: 'g1' })
    // The ok arm is silent: the conceded flag and any terminal arrive by
    // subscription, so there is nothing for the conceder to be told.
    expect(showError).not.toHaveBeenCalled()
  })

  it('surfaces the lost race — somebody else ended it, or I already conceded', async () => {
    const { result, rpc, showError } = setup({ mode: 'compete' })
    rpc.mockResolvedValue(ALREADY_CONCEDED)
    act(() => result.current.actConcede.run())
    await flush()
    expect(showError).toHaveBeenCalledTimes(1)
    expect(showError.mock.calls[0]![0]).toMatchObject({ mode: { kind: 'sticky' } })
  })
})

describe('restart', () => {
  it('asks, fires replay_board, then runs the game cleanup', async () => {
    const { result, rpc, onRestarted } = setup()
    rpc.mockResolvedValue(REPLAYED_OK)
    act(() => result.current.actRestart.run())
    await flush()
    expect(askConfirmation).toHaveBeenCalledTimes(1)
    expect(rpc).toHaveBeenCalledWith('replay_board', { target_game: 'g1' })
    expect(onRestarted).toHaveBeenCalledTimes(1)
  })

  it('goes straight through at terminal — nothing left to interrupt', async () => {
    const { result, rpc } = setup({ isTerminal: true })
    rpc.mockResolvedValue(REPLAYED_OK)
    act(() => result.current.actRestart.run())
    await flush()
    expect(askConfirmation).not.toHaveBeenCalled()
    expect(rpc).toHaveBeenCalledWith('replay_board', { target_game: 'g1' })
  })

  it('leaves the cleanup alone when the board was not replayed', async () => {
    const { result, rpc, onRestarted, showError } = setup()
    rpc.mockResolvedValue(ALREADY_CONCEDED)
    act(() => result.current.actRestart.run())
    await flush()
    expect(onRestarted).not.toHaveBeenCalled()
    expect(showError).toHaveBeenCalledTimes(1)
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
