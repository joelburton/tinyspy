// cs-unmet

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
  const rpc = vi.fn().mockResolvedValue({ data: null, error: null })
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

  it('shows a lost End race in the words and tone the server chose', async () => {
    const { result, rpc, showError } = setup()
    // The words are the SERVER's now — PN486, written at the raise — where they
    // used to be looked up in errorCopy.ts from the key `game-not-in-play|`.
    // Same sentence, same `noted` tone; one fewer place for them to live.
    rpc.mockResolvedValue({
      data: { type: 'not-ok', data: null, outcome: 'noted', severity: 'race',
              message: 'Game over', field: '_', meta: null,
              dbcode: 'PN486', detail: null },
      error: null,
    })
    act(() => result.current.endGame())
    await flush()
    expect(showError).toHaveBeenCalledWith({
      tone: 'noted',
      text: 'Game over',
      mode: { kind: 'sticky' },
    })
  })

  it('runs nothing extra on the ok arm', async () => {
    const { result, rpc, showError } = setup()
    rpc.mockResolvedValue({
      data: { type: 'ok', data: { result: 'ended' }, outcome: null, severity: null,
              message: null, field: null, meta: null, dbcode: null, detail: null },
      error: null,
    })
    act(() => result.current.endGame())
    await flush()
    expect(showError).not.toHaveBeenCalled()
  })
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

describe('concede', () => {
  it('confirms via window.confirm, then fires concede', async () => {
    const { result, rpc, showError } = setup()
    rpc.mockResolvedValue(CONCEDED_OK)
    act(() => result.current.concede())
    await flush()
    expect(window.confirm).toHaveBeenCalledTimes(1)
    expect(rpc).toHaveBeenCalledWith('concede', { target_game: 'g1' })
    // The ok arm is silent: the conceded flag and any terminal arrive by
    // subscription, so there is nothing for the conceder to be told.
    expect(showError).not.toHaveBeenCalled()
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

  it('shows a RACE as an ordinary sticky pill, in the words the server sent', async () => {
    const { result, rpc, showError } = setup()
    rpc.mockResolvedValue(ALREADY_CONCEDED)
    act(() => result.current.concede())
    await flush()
    // Both races here are the hook's own gates losing to the subscription that
    // feeds them, so they read as news rather than as a failure.
    expect(showError).toHaveBeenCalledWith({
      tone: 'noted',
      text: 'Already conceded',
      mode: { kind: 'sticky' },
    })
  })

  it('still SHOWS a fault, having left the modal to runRpc', async () => {
    const { result, rpc, showError } = setup()
    rpc.mockResolvedValue({ data: null, error: { message: 'nope', code: '42501' } })
    act(() => result.current.concede())
    await flush()
    // A pill, not a fault-flagged message: `runRpc` raised the modal centrally
    // with the transport facts, and marking this one too would double it. The
    // pill still has to appear — the modal is an escalation, not a substitute.
    expect(showError).toHaveBeenCalledWith(expect.objectContaining({
      tone: 'error',
      mode: { kind: 'sticky' },
    }))
  })
})

/** `replay_board`'s one arm, as PostgREST hands it over. */
const REPLAYED_OK = {
  data: { type: 'ok', data: { result: 'replayed' }, outcome: null, severity: null,
          message: null, field: null, meta: null, dbcode: null, detail: null },
  error: null,
}

describe('restart', () => {
  it('confirms MID-GAME through the styled modal, fires replay_board, then runs onRestarted', async () => {
    const { result, rpc, confirm, onRestarted } = setup({ isTerminal: false })
    rpc.mockResolvedValue(REPLAYED_OK)
    act(() => result.current.restart())
    await flush()
    // The styled ConfirmationBlockingModal, not window.confirm — Restart migrated off the
    // browser alert when it became reachable in all thirteen games.
    expect(confirm).toHaveBeenCalledTimes(1)
    expect(confirm.mock.calls[0][0]).toMatchObject({ confirmLabel: 'Restart' })
    expect(window.confirm).not.toHaveBeenCalled()
    expect(rpc).toHaveBeenCalledWith('replay_board', { target_game: 'g1' })
    expect(onRestarted).toHaveBeenCalledTimes(1)
  })

  it('skips the confirm at terminal (nothing left to lose)', async () => {
    const { result, rpc, confirm, onRestarted } = setup({ isTerminal: true })
    rpc.mockResolvedValue(REPLAYED_OK)
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
    rpc.mockResolvedValue({ data: null, error: { message: 'TypeError: Load failed', code: '' } })
    act(() => result.current.restart())
    await flush()
    // A pill, not a fault-flagged message — `runRpc` raised the modal centrally
    // with the transport facts. The cleanup is what must not run: the board did
    // not reset, so re-hiding wordle's answer would lie about the state.
    expect(showError).toHaveBeenCalledWith(expect.objectContaining({
      tone: 'error',
      mode: { kind: 'sticky' },
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
      () => new Promise((resolve) => { release = () => resolve(REPLAYED_OK) }),
    )

    act(() => result.current.restart())
    act(() => result.current.restart())
    expect(rpc).toHaveBeenCalledTimes(1)

    await act(async () => { release() })
    expect(onRestarted).toHaveBeenCalledTimes(1)
  })

  it('is retryable once the first replay settles — including after a failure', async () => {
    const { result, rpc, showError } = setup({ isTerminal: true })
    rpc.mockResolvedValue({ data: null, error: { message: 'TypeError: Load failed', code: '' } })
    act(() => result.current.restart())
    await flush()
    expect(showError).toHaveBeenCalledTimes(1)

    // The guard must have cleared on the error path, or a failed replay would
    // wedge the button for the rest of the session.
    rpc.mockResolvedValue(REPLAYED_OK)
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
