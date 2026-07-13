/**
 * Tests for useStandardGameActions — the End / Concede / Replay handlers shared
 * by the found-words + board games (spellingbee, wordwheel, wordiply, boggle,
 * waffle, wordle). Each was hand-rolled identically before; this owns the one
 * copy, so its guards (terminal / already-conceded), its two confirm paths
 * (styled modal for End, window.confirm for Concede + Replay), and its
 * error-surfacing are worth pinning once.
 *
 * The handlers are fire-and-forget (`void (async () => …)()`), so each test
 * calls one and then flushes the microtask/timer queue before asserting.
 */

import { act, renderHook } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { useStandardGameActions } from './useStandardGameActions'

/** Drain the handler's async IIFE (confirm → rpc → callback). */
const flush = () => act(async () => { await new Promise((r) => setTimeout(r, 0)) })

type Overrides = { isTerminal?: boolean; myConceded?: boolean; confirmResult?: boolean }

function setup(overrides: Overrides = {}) {
  const rpc = vi.fn().mockResolvedValue({ error: null })
  const confirm = vi.fn().mockResolvedValue(overrides.confirmResult ?? true)
  const showError = vi.fn()
  const onReplayed = vi.fn()
  const { result } = renderHook(() =>
    useStandardGameActions({
      db: { rpc },
      gameId: 'g1',
      isTerminal: overrides.isTerminal ?? false,
      myConceded: overrides.myConceded ?? false,
      confirm,
      replayConfirm: 'Replay this board?',
      showError,
      onReplayed,
    }),
  )
  return { result, rpc, confirm, showError, onReplayed }
}

beforeEach(() => {
  vi.spyOn(window, 'confirm').mockReturnValue(true)
})
afterEach(() => {
  vi.restoreAllMocks()
})

describe('endGame', () => {
  it('confirms via the styled modal, then fires end_game', async () => {
    const { result, rpc, confirm } = setup()
    act(() => result.current.endGame())
    await flush()
    expect(confirm).toHaveBeenCalledTimes(1)
    expect(rpc).toHaveBeenCalledWith('end_game', { target_game: 'g1' })
  })

  it('is a no-op once the game is terminal', async () => {
    const { result, rpc, confirm } = setup({ isTerminal: true })
    act(() => result.current.endGame())
    await flush()
    expect(confirm).not.toHaveBeenCalled()
    expect(rpc).not.toHaveBeenCalled()
  })

  it('does nothing if the confirm is dismissed', async () => {
    const { result, rpc } = setup({ confirmResult: false })
    act(() => result.current.endGame())
    await flush()
    expect(rpc).not.toHaveBeenCalled()
  })

  it('surfaces an RPC failure through showError', async () => {
    const { result, rpc, showError } = setup()
    rpc.mockResolvedValue({ error: { message: 'boom' } })
    act(() => result.current.endGame())
    await flush()
    expect(showError).toHaveBeenCalledWith('End game failed: boom')
  })
})

describe('concede', () => {
  it('confirms via window.confirm, then fires concede', async () => {
    const { result, rpc } = setup()
    act(() => result.current.concede())
    await flush()
    expect(window.confirm).toHaveBeenCalledTimes(1)
    expect(rpc).toHaveBeenCalledWith('concede', { target_game: 'g1' })
  })

  it('is a no-op when I have already conceded', async () => {
    const { result, rpc } = setup({ myConceded: true })
    act(() => result.current.concede())
    await flush()
    expect(window.confirm).not.toHaveBeenCalled()
    expect(rpc).not.toHaveBeenCalled()
  })

  it('does nothing if window.confirm is dismissed', async () => {
    vi.spyOn(window, 'confirm').mockReturnValue(false)
    const { result, rpc } = setup()
    act(() => result.current.concede())
    await flush()
    expect(rpc).not.toHaveBeenCalled()
  })

  it('surfaces an RPC failure through showError', async () => {
    const { result, rpc, showError } = setup()
    rpc.mockResolvedValue({ error: { message: 'nope' } })
    act(() => result.current.concede())
    await flush()
    expect(showError).toHaveBeenCalledWith('Concede failed: nope')
  })
})

describe('replay', () => {
  it('confirms MID-GAME, fires replay_board, then runs onReplayed', async () => {
    const { result, rpc, onReplayed } = setup({ isTerminal: false })
    act(() => result.current.replay())
    await flush()
    expect(window.confirm).toHaveBeenCalledTimes(1)
    expect(rpc).toHaveBeenCalledWith('replay_board', { target_game: 'g1' })
    expect(onReplayed).toHaveBeenCalledTimes(1)
  })

  it('skips the confirm at terminal (nothing left to lose)', async () => {
    const { result, rpc, onReplayed } = setup({ isTerminal: true })
    act(() => result.current.replay())
    await flush()
    expect(window.confirm).not.toHaveBeenCalled()
    expect(rpc).toHaveBeenCalledWith('replay_board', { target_game: 'g1' })
    expect(onReplayed).toHaveBeenCalledTimes(1)
  })

  it('does nothing if the mid-game confirm is dismissed', async () => {
    vi.spyOn(window, 'confirm').mockReturnValue(false)
    const { result, rpc, onReplayed } = setup({ isTerminal: false })
    act(() => result.current.replay())
    await flush()
    expect(rpc).not.toHaveBeenCalled()
    expect(onReplayed).not.toHaveBeenCalled()
  })

  it('does NOT run onReplayed when the RPC fails', async () => {
    const { result, rpc, showError, onReplayed } = setup({ isTerminal: true })
    rpc.mockResolvedValue({ error: { message: 'reset failed' } })
    act(() => result.current.replay())
    await flush()
    expect(showError).toHaveBeenCalledWith('Replay failed: reset failed')
    expect(onReplayed).not.toHaveBeenCalled()
  })
})
