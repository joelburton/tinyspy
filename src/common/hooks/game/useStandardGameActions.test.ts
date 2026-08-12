/**
 * Tests for useStandardGameActions — the End / Concede / Replay handlers shared
 * by the found-words + board games (spellingbee, wordwheel, wordiply, boggle,
 * waffle, wordle). Each was hand-rolled identically before; this owns the one
 * copy, so its guards (terminal / already-conceded), its two confirm paths
 * (the styled modal for End + Replay, window.confirm for Concede), and its
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
  const onRestarted = vi.fn()
  const { result } = renderHook(() =>
    useStandardGameActions({
      db: { rpc },
      gameId: 'g1',
      isTerminal: overrides.isTerminal ?? false,
      myConceded: overrides.myConceded ?? false,
      confirm,
      showError,
      onRestarted,
    }),
  )
  return { result, rpc, confirm, showError, onRestarted }
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

  it('surfaces an RPC failure through showError as the full message', async () => {
    const { result, rpc, showError } = setup()
    // A keyed rejection the copy table knows: the words a player reads are
    // TypeScript's, not the server's (lib/game/errorCopy.ts). The sink gets the
    // whole GenericFeedbackMsg — an expected race stays an ordinary pill.
    rpc.mockResolvedValue({ error: { message: 'not-your-turn|', code: 'P0001' } })
    act(() => result.current.endGame())
    await flush()
    expect(showError).toHaveBeenCalledWith({
      tone: 'error',
      text: 'Not your turn',
      mode: { kind: 'sticky' },
    })
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

  it('surfaces an unexpected RPC failure as a FAULT, not a pill', async () => {
    const { result, rpc, showError } = setup()
    rpc.mockResolvedValue({ error: { message: 'nope', code: '42501' } })
    act(() => result.current.concede())
    await flush()
    // The fault flag and its manual mode survive the trip now that the sink
    // takes the full message — this styling is what the widening was for.
    expect(showError).toHaveBeenCalledWith(expect.objectContaining({
      tone: 'error',
      fault: true,
      text: 'concede|nope',
      mode: { kind: 'manual' },
      // The modal's line-3 payload rides along on every fault.
      diagnostics: expect.stringContaining('code=42501'),
    }))
  })
})

describe('restart', () => {
  it('confirms MID-GAME through the styled modal, fires replay_board, then runs onRestarted', async () => {
    const { result, rpc, confirm, onRestarted } = setup({ isTerminal: false })
    act(() => result.current.restart())
    await flush()
    // The styled ConfirmDialog, not window.confirm — Restart migrated off the
    // browser alert when it became reachable in all thirteen games.
    expect(confirm).toHaveBeenCalledTimes(1)
    expect(confirm.mock.calls[0][0]).toMatchObject({ confirmLabel: 'Restart' })
    expect(window.confirm).not.toHaveBeenCalled()
    expect(rpc).toHaveBeenCalledWith('replay_board', { target_game: 'g1' })
    expect(onRestarted).toHaveBeenCalledTimes(1)
  })

  it('skips the confirm at terminal (nothing left to lose)', async () => {
    const { result, rpc, confirm, onRestarted } = setup({ isTerminal: true })
    act(() => result.current.restart())
    await flush()
    expect(confirm).not.toHaveBeenCalled()
    expect(rpc).toHaveBeenCalledWith('replay_board', { target_game: 'g1' })
    expect(onRestarted).toHaveBeenCalledTimes(1)
  })

  it('does nothing if the mid-game confirm is dismissed', async () => {
    const { result, rpc, onRestarted } = setup({ isTerminal: false, confirmResult: false })
    act(() => result.current.restart())
    await flush()
    expect(rpc).not.toHaveBeenCalled()
    expect(onRestarted).not.toHaveBeenCalled()
  })

  it('does NOT run onRestarted when the RPC fails', async () => {
    const { result, rpc, showError, onRestarted } = setup({ isTerminal: true })
    rpc.mockResolvedValue({ error: { message: 'TypeError: Load failed', code: '' } })
    act(() => result.current.restart())
    await flush()
    expect(showError).toHaveBeenCalledWith(expect.objectContaining({
      fault: true,
      text: 'restart: Server; try refresh',
      diagnostics: expect.stringContaining('no-code'),
    }))
    expect(onRestarted).not.toHaveBeenCalled()
  })

  // ── The in-flight guard ──
  // Terminal (no confirm) is the realistic double-click: the RestartButton sits
  // right there in the terminal row and nothing slows the second click down.
  it('drops a second click while the first replay_board is in flight', async () => {
    const { result, rpc, onRestarted } = setup({ isTerminal: true })
    let release!: () => void
    rpc.mockImplementation(
      () => new Promise((resolve) => { release = () => resolve({ error: null }) }),
    )

    act(() => result.current.restart())
    act(() => result.current.restart())
    expect(rpc).toHaveBeenCalledTimes(1)

    await act(async () => { release() })
    expect(onRestarted).toHaveBeenCalledTimes(1)
  })

  it('is retryable once the first replay settles — including after a failure', async () => {
    const { result, rpc, showError } = setup({ isTerminal: true })
    rpc.mockResolvedValue({ error: { message: 'TypeError: Load failed', code: '' } })
    act(() => result.current.restart())
    await flush()
    expect(showError).toHaveBeenCalledTimes(1)

    // The guard must have cleared on the error path, or a failed replay would
    // wedge the button for the rest of the session.
    rpc.mockResolvedValue({ error: null })
    act(() => result.current.restart())
    await flush()
    expect(rpc).toHaveBeenCalledTimes(2)
  })

  it('does not arm the guard when the mid-game confirm is dismissed', async () => {
    const { result, rpc, confirm } = setup({ isTerminal: false, confirmResult: false })
    act(() => result.current.restart())
    await flush()
    expect(rpc).not.toHaveBeenCalled()

    // Saying "no" must leave restart usable — the guard is only for a call
    // that actually reached the RPC.
    confirm.mockResolvedValue(true)
    act(() => result.current.restart())
    await flush()
    expect(rpc).toHaveBeenCalledTimes(1)
  })
})
