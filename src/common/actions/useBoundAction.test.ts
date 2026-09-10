// cs-unmet

/**
 * Tests for the live half: joining and leaving the stack, the shared run's
 * confirmation and single flight, and the shorthand `describe` answer.
 *
 * The confirmation service is mocked because what matters here is WHETHER the
 * question was asked and what happened to the answer — the modal itself is
 * `ConfirmationBlockingModal`'s own test.
 */
import { act, renderHook } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { liveBindings, useBoundAction, type LiveAction } from './useBoundAction'

const askConfirmation = vi.fn(async () => true)
vi.mock('../floating-panels/confirmationService', () => ({
  askConfirmation: (...args: unknown[]) => askConfirmation(...(args as [])),
}))

beforeEach(() => {
  askConfirmation.mockClear()
  askConfirmation.mockResolvedValue(true)
})

/** Bind one action, with the parts a test cares about defaulted. */
function bind(id: Parameters<typeof useBoundAction>[0], live: Partial<LiveAction> = {}) {
  const run = vi.fn()
  const full: LiveAction = { run, describe: () => 'active', ...live }
  const view = renderHook(() => useBoundAction(id, full))
  return { run, view }
}

describe('useBoundAction — the stack', () => {
  it('joins on mount and leaves on unmount', () => {
    const { view } = bind('act-shuffle')
    expect(liveBindings().map((b) => b.id)).toEqual(['act-shuffle'])
    view.unmount()
    expect(liveBindings()).toEqual([])
  })

  it('holds the LATEST closure, without re-registering', () => {
    let word = 'first'
    const view = renderHook(() =>
      useBoundAction('act-submit', { run: () => undefined, describe: () => ({ state: 'active', label: word }) }),
    )
    expect(liveBindings()[0]!.describe().label).toBe('first')
    word = 'second'
    view.rerender()
    expect(liveBindings()[0]!.describe().label).toBe('second')
    view.unmount()
  })
})

describe('useBoundAction — describe', () => {
  it('takes a bare state as shorthand', () => {
    const { view } = bind('act-shuffle', { describe: () => 'disabled' })
    expect(view.result.current.describe()).toEqual({ state: 'disabled' })
    view.unmount()
  })

  it('passes a label through when there is one', () => {
    const { view } = bind('act-submit', { describe: () => ({ state: 'active', label: 'Submit · 24' }) })
    expect(view.result.current.describe()).toEqual({ state: 'active', label: 'Submit · 24' })
    view.unmount()
  })
})

describe('useBoundAction — the shared run', () => {
  it('asks the registry question before acting', async () => {
    const { run, view } = bind('act-new-game')
    await act(async () => view.result.current.run())
    expect(askConfirmation).toHaveBeenCalledTimes(1)
    expect(run).toHaveBeenCalledTimes(1)
    view.unmount()
  })

  it('does nothing when the question is answered no', async () => {
    askConfirmation.mockResolvedValue(false)
    const { run, view } = bind('act-new-game')
    await act(async () => view.result.current.run())
    expect(run).not.toHaveBeenCalled()
    view.unmount()
  })

  it('skips the question at terminal — there is nothing left to interrupt', async () => {
    const { run, view } = bind('act-new-game', { terminal: true })
    await act(async () => view.result.current.run())
    expect(askConfirmation).not.toHaveBeenCalled()
    expect(run).toHaveBeenCalledTimes(1)
    view.unmount()
  })

  it('asks nothing for an action with no question', async () => {
    const { run, view } = bind('act-shuffle')
    await act(async () => view.result.current.run())
    expect(askConfirmation).not.toHaveBeenCalled()
    expect(run).toHaveBeenCalledTimes(1)
    view.unmount()
  })

  it('drops a second run while the first is still out', async () => {
    let release = () => {}
    const run = vi.fn(() => new Promise<void>((resolve) => { release = resolve }))
    const view = renderHook(() => useBoundAction('act-shuffle', { run, describe: () => 'active' }))

    act(() => view.result.current.run())
    expect(view.result.current.pending).toBe(true)
    act(() => view.result.current.run())
    expect(run).toHaveBeenCalledTimes(1)

    await act(async () => { release() })
    expect(view.result.current.pending).toBe(false)
    view.unmount()
  })

  it('hands a pattern action the key that fired it', async () => {
    const { run, view } = bind('act-type-letter')
    await act(async () => view.result.current.run('q'))
    expect(run).toHaveBeenCalledWith('q')
    view.unmount()
  })
})
