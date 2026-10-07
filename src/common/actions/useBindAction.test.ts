// cs-blessed-actions

/**
 * Tests for binding: joining and leaving the stack, the shared run's
 * confirmation and single flight, and the shorthand `describe` answer.
 *
 * The confirmation service is mocked because what matters here is WHETHER the
 * question was asked and what happened to the answer — the modal itself is
 * `ConfirmationBlockingModal`'s own test.
 */
import { act, renderHook } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { useBindAction, type BindActionOptions } from './useBindAction'
import { getActions } from './actionsStore'

const askConfirmation = vi.fn(async (): Promise<'confirm' | 'alternative' | null> => 'confirm')
const withdrawConfirmation = vi.fn()
vi.mock('../floating-panels/confirmationService', () => ({
  askConfirmation: (...args: unknown[]) => askConfirmation(...(args as [])),
  withdrawConfirmation: (...args: unknown[]) => withdrawConfirmation(...args),
}))

beforeEach(() => {
  askConfirmation.mockClear()
  askConfirmation.mockResolvedValue('confirm')
  withdrawConfirmation.mockClear()
})

/** Bind one action, with the parts a test cares about defaulted. */
function bind(id: Parameters<typeof useBindAction>[0], live: Partial<BindActionOptions> = {}) {
  const run = vi.fn()
  const full: BindActionOptions = { run, describe: () => 'active', ...live }
  const view = renderHook(() => useBindAction(id, full))
  return { run, view }
}

describe('useBindAction — the stack', () => {
  it('joins on mount and leaves on unmount', () => {
    const { view } = bind('act-shuffle')
    expect(getActions().map((b) => b.id)).toEqual(['act-shuffle'])
    view.unmount()
    expect(getActions()).toEqual([])
  })

  it('holds the LATEST closure, without re-registering', () => {
    let word = 'first'
    const view = renderHook(() =>
      useBindAction('act-submit', { run: () => undefined, describe: () => ({ state: 'active', label: word }) }),
    )
    expect(getActions()[0]!.describe('button').label).toBe('first')
    word = 'second'
    view.rerender()
    expect(getActions()[0]!.describe('button').label).toBe('second')
    view.unmount()
  })
})

describe('useBindAction — describe', () => {
  it('takes a bare state as shorthand', () => {
    const { view } = bind('act-shuffle', { describe: () => 'disabled' })
    expect(view.result.current.describe('button')).toEqual({ state: 'disabled' })
    view.unmount()
  })

  it('answers for THIS render, not the one before', () => {
    // A surface reads `describe()` while the tree is rendering — a game's info
    // column asks about an action its PlayArea bound in the same pass. Answering
    // from the previous render put a button saying "Reveal" (the fixed label,
    // disabled) beside a row that had already switched to the game-over look.
    let over = false
    const view = renderHook(() =>
      useBindAction('act-reveal', {
        run: () => undefined,
        describe: () => (over ? { state: 'active' as const, label: 'Reveal secrets' } : 'disabled' as const),
      }),
    )
    over = true
    view.rerender()
    expect(view.result.current.describe('button')).toEqual({ state: 'active', label: 'Reveal secrets' })
    view.unmount()
  })

  it('passes a label through when there is one', () => {
    const { view } = bind('act-submit', { describe: () => ({ state: 'active', label: 'Submit · 24' }) })
    expect(view.result.current.describe('button')).toEqual({ state: 'active', label: 'Submit · 24' })
    view.unmount()
  })
})

describe('useBindAction — the shared run', () => {
  it('asks the registry question before acting', async () => {
    const { run, view } = bind('act-new-game')
    await act(async () => view.result.current.run())
    expect(askConfirmation).toHaveBeenCalledTimes(1)
    expect(run).toHaveBeenCalledTimes(1)
    view.unmount()
  })

  it('does nothing when the question is answered no', async () => {
    askConfirmation.mockResolvedValue(null)
    const { run, view } = bind('act-new-game')
    await act(async () => view.result.current.run())
    expect(run).not.toHaveBeenCalled()
    view.unmount()
  })

  it('skips the question once the game has ended — there is nothing left to interrupt', async () => {
    const { run, view } = bind('act-new-game', { ended: true })
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

  it('runs the body from the moment of the ANSWER, not the moment of the press', async () => {
    // The game keeps rendering while the question is up, and an action's
    // callback closes over that render's state. The one that runs must be the
    // one on the stack when the answer lands.
    let settle: (answer: 'confirm' | null) => void = () => {}
    askConfirmation.mockImplementation(() => new Promise((resolve) => { settle = resolve }))
    const before = vi.fn()
    const after = vi.fn()
    let run = before
    const view = renderHook(() => useBindAction('act-new-game', { run, describe: () => 'active' }))

    act(() => view.result.current.run())
    run = after
    view.rerender()
    await act(async () => { settle('confirm') })

    expect(after).toHaveBeenCalledTimes(1)
    expect(before).not.toHaveBeenCalled()
    view.unmount()
  })

  it('takes its question back, and runs nothing, when it unmounts under the question', async () => {
    // The question is drawn above every route, so an action can unmount while
    // it is up — a peer's suspend navigates away, a pause takes the play surface
    // — and an answer then would run on a game the player has left.
    let settle: (answer: 'confirm' | null) => void = () => {}
    askConfirmation.mockImplementation(() => new Promise((resolve) => { settle = resolve }))
    const { run, view } = bind('act-restart')

    act(() => view.result.current.run())
    view.unmount()
    expect(withdrawConfirmation).toHaveBeenCalledTimes(1)
    await act(async () => { settle('confirm') })
    expect(run).not.toHaveBeenCalled()
  })

  it('withdraws nothing when it unmounts with no question of its own up', () => {
    const { view } = bind('act-restart')
    view.unmount()
    expect(withdrawConfirmation).not.toHaveBeenCalled()
  })

  it('drops a second run while the first is still out', async () => {
    let release = () => {}
    const run = vi.fn(() => new Promise<void>((resolve) => { release = resolve }))
    const view = renderHook(() => useBindAction('act-shuffle', { run, describe: () => 'active' }))

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
