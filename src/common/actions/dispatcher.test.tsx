// cs-unmet

/**
 * Tests for the one key listener: the two gates, auto-repeat, who wins when two
 * bindings want a key, and the wildcard that watches without claiming.
 *
 * Each test binds real actions off the registry and presses a real window
 * keydown, so what is exercised is the whole path a keystroke actually takes.
 */
import { act, render, renderHook } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { useActionDispatcher } from './dispatcher'
import { useBoundAction, type ActionState, type LiveAction } from './useBoundAction'
import type { ActionId } from './registry'

// The questions actions ask are `useBoundAction`'s subject, not this one's —
// mocked so a keystroke's whole path can be tested without a modal in it.
vi.mock('../floating-panels/confirmationService', () => ({
  askConfirmation: async () => 'confirm',
}))

/** A keydown on the window, optionally aimed at an element. Awaited, because a
 *  run is async: the flight flag settles a microtask after the key. */
async function press(init: KeyboardEventInit & { key: string }, target?: Element) {
  await act(async () => {
    const e = new KeyboardEvent('keydown', { bubbles: true, cancelable: true, ...init })
    ;(target ?? window).dispatchEvent(e)
  })
}

/** Mount the dispatcher plus a list of bindings, in the order given (so the
 *  last is the innermost). */
function setup(...bindings: Array<[ActionId, Partial<LiveAction>]>) {
  const runs = bindings.map(() => vi.fn())
  const view = renderHook(() => {
    useActionDispatcher()
    // A fixed-length list per test, so the hook order is stable across renders.
    bindings.forEach(([id, live], i) => {
      useBoundAction(id, { run: runs[i]!, describe: () => 'active' as ActionState, ...live })
    })
  })
  return { runs, view }
}

describe('the dispatcher — matching', () => {
  it('fires the action whose key was pressed', async () => {
    const { runs, view } = setup(['act-new-game', {}])
    await press({ key: '+', shiftKey: true })
    expect(runs[0]).toHaveBeenCalledTimes(1)
    view.unmount()
  })

  it('leaves a key nothing wants to the browser', async () => {
    const { runs, view } = setup(['act-new-game', {}])
    await press({ key: 'r', metaKey: true })
    expect(runs[0]).not.toHaveBeenCalled()
    view.unmount()
  })

  it('stops the keystroke it takes', async () => {
    const { view } = setup(['act-new-game', {}])
    const e = new KeyboardEvent('keydown', { key: '+', bubbles: true, cancelable: true })
    await act(async () => {
      window.dispatchEvent(e)
    })
    expect(e.defaultPrevented).toBe(true)
    view.unmount()
  })

  it('ignores a held key unless the action repeats', async () => {
    // Holding `+` would otherwise start games at the OS repeat rate.
    const { runs, view } = setup(['act-new-game', {}], ['act-type-letter', {}])
    await press({ key: '+', repeat: true })
    expect(runs[0]).not.toHaveBeenCalled()
    await press({ key: 'q', repeat: true })
    expect(runs[1]).toHaveBeenCalledTimes(1)
    view.unmount()
  })
})

describe('the dispatcher — state', () => {
  it('skips a hidden or disabled binding, so the key can fall through', async () => {
    // Both want ⌥⌫; End is disabled at terminal, so Concede answers.
    const { runs, view } = setup(
      ['act-concede', {}],
      ['act-end-game', { describe: () => 'disabled' as ActionState }],
    )
    await press({ key: 'Backspace', code: 'Backspace', altKey: true })
    expect(runs[1]).not.toHaveBeenCalled()
    expect(runs[0]).toHaveBeenCalledTimes(1)
    view.unmount()
  })

  it('a disabled binding still keeps the key from the browser', async () => {
    // Space with no legal peel must not scroll the page; the binding is here,
    // just not right now.
    const { runs, view } = setup(['act-peel', { describe: () => 'disabled' as ActionState }])
    const e = new KeyboardEvent('keydown', { key: ' ', bubbles: true, cancelable: true })
    await act(async () => {
      window.dispatchEvent(e)
    })
    expect(e.defaultPrevented).toBe(true)
    expect(runs[0]).not.toHaveBeenCalled()
    view.unmount()
  })

  it('a hidden binding leaves the key to the browser', async () => {
    const { view } = setup(['act-peel', { describe: () => 'hidden' as ActionState }])
    const e = new KeyboardEvent('keydown', { key: ' ', bubbles: true, cancelable: true })
    await act(async () => {
      window.dispatchEvent(e)
    })
    expect(e.defaultPrevented).toBe(false)
    view.unmount()
  })

  // Two bindings in ONE component are in call order, and the earlier is the
  // "inner" one — see the stack's docstring. It is arbitrary and nothing should
  // lean on it; it is pinned only so a change to the walk is visible.
  it('gives the key to the first binding that wants it, within one component', async () => {
    const { runs, view } = setup(['act-submit-entry', {}], ['act-submit', {}])
    await press({ key: 'Enter' })
    expect(runs[0]).toHaveBeenCalledTimes(1)
    expect(runs[1]).not.toHaveBeenCalled()
    view.unmount()
  })
})

describe('the dispatcher — the gates', () => {
  it('lets a focused text field keep its keys', async () => {
    const field = document.createElement('input')
    document.body.append(field)
    const { runs, view } = setup(['act-new-game', {}])
    await press({ key: '+' }, field)
    expect(runs[0]).not.toHaveBeenCalled()
    field.remove()
    view.unmount()
  })

  it("still reaches the shell's keys from a GAME's own input", async () => {
    // So you can hit `/` for chat mid-clue, but `/` types literally in chat.
    const gameInput = document.createElement('input')
    gameInput.dataset.gameInput = ''
    const chatInput = document.createElement('input')
    document.body.append(gameInput, chatInput)

    const { runs, view } = setup(['act-open-chat', {}])
    await press({ key: '/' }, gameInput)
    expect(runs[0]).toHaveBeenCalledTimes(1)
    await press({ key: '/' }, chatInput)
    expect(runs[0]).toHaveBeenCalledTimes(1)

    gameInput.remove()
    chatInput.remove()
    view.unmount()
  })

  it('hands the keyboard to a floating panel entirely', async () => {
    const panel = document.createElement('div')
    panel.dataset.floatingPanel = ''
    const button = document.createElement('button')
    panel.append(button)
    document.body.append(panel)

    // Even an action that may fire inside a field is off inside a panel.
    const { runs, view } = setup(['act-open-chat', {}], ['act-new-game', {}])
    await press({ key: '/' }, button)
    await press({ key: '+' }, button)
    expect(runs[0]).not.toHaveBeenCalled()
    expect(runs[1]).not.toHaveBeenCalled()

    panel.remove()
    view.unmount()
  })
})

describe('the dispatcher — the watchers', () => {
  it('runs a non-consuming wildcard alongside the action that answers', async () => {
    // The press that dismisses the last message still types its letter.
    const { runs, view } = setup(['act-dismiss-feedback', {}], ['act-type-letter', {}])
    await press({ key: 'q' })
    expect(runs[0]).toHaveBeenCalledWith('q')
    expect(runs[1]).toHaveBeenCalledWith('q')
    view.unmount()
  })

  it('runs a wildcard whatever order it was bound in', async () => {
    const { runs, view } = setup(['act-type-letter', {}], ['act-dismiss-feedback', {}])
    await press({ key: 'q' })
    expect(runs[0]).toHaveBeenCalledWith('q')
    expect(runs[1]).toHaveBeenCalledWith('q')
    view.unmount()
  })

  it('lets a CONSUMING wildcard take the key outright', async () => {
    // Leaving the history viewer must not also play a move on the board you
    // have only just got back.
    const { runs, view } = setup(['act-type-letter', {}], ['act-exit-viewer', {}])
    await press({ key: 'q' })
    expect(runs[1]).toHaveBeenCalledTimes(1)
    expect(runs[0]).not.toHaveBeenCalled()
    view.unmount()
  })

  it('a consuming wildcard beats an INNER binding too — a mode is not a key', async () => {
    // The order the real games are in: the viewer belongs to the page and the
    // board's keys to a column inside it, so the inner one would win on
    // position. It must not: while a past turn is open the next keystroke means
    // "back to the live board", whoever else is listening.
    const { runs, view } = setup(['act-exit-viewer', {}], ['act-type-letter', {}])
    await press({ key: 'q' })
    expect(runs[0]).toHaveBeenCalledTimes(1)
    expect(runs[1]).not.toHaveBeenCalled()
    view.unmount()
  })
})

describe('the dispatcher — where a child sits in the stack', () => {
  // What `setup` above cannot say: its bindings all sit in ONE component, where
  // order is just call order. A binding joins from an effect, React runs
  // effects children first, and a later commit appends — so a child mounted
  // WITH its page sits ahead of it, and one mounted LATER sits behind it. Both
  // are pinned so the limit is a known fact; neither is a channel a binding
  // may lean on (the stack's docstring says why).
  function Child({ onRun }: { onRun: () => void }) {
    useBoundAction('act-submit-entry', { run: onRun, describe: () => 'active' })
    return null
  }
  function Page({ onPage, onChild, child = true }: { onPage: () => void; onChild: () => void; child?: boolean }) {
    useActionDispatcher()
    useBoundAction('act-submit', { run: onPage, describe: () => 'active' })
    return child ? <Child onRun={onChild} /> : null
  }

  it('a child mounted WITH the page wins a key they both want', async () => {
    const onPage = vi.fn()
    const onChild = vi.fn()
    const view = render(<Page onPage={onPage} onChild={onChild} />)
    await press({ key: 'Enter' })
    expect(onChild).toHaveBeenCalledTimes(1)
    expect(onPage).not.toHaveBeenCalled()
    view.unmount()
  })

  it('a child mounted LATER does not — it joined behind the page', async () => {
    const onPage = vi.fn()
    const onChild = vi.fn()
    const view = render(<Page onPage={onPage} onChild={onChild} child={false} />)
    view.rerender(<Page onPage={onPage} onChild={onChild} child />)
    await press({ key: 'Enter' })
    expect(onPage).toHaveBeenCalledTimes(1)
    expect(onChild).not.toHaveBeenCalled()
    view.unmount()
  })
})

/**
 * The development complaint. Two commands claiming one keystroke is settled by
 * where each was bound — React's effect order — which is not a decision anybody
 * made, so it is worth saying out loud while it can still be fixed.
 *
 * Each of these uses its own pair of ids: the warning reports a pair once per
 * session, so a shared pair would make the second test depend on the first.
 */
describe('the dispatcher — the chord-tie warning', () => {
  it('names both commands when two live ones want the same key', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    // The real case this was built for: bananagrams offers End alongside
    // Concede, and the registry gives both ⌥⌫.
    const { view } = setup(['act-end-game', {}], ['act-concede', {}])
    // ⌥⌫ matches on the PHYSICAL key — Option changes the character.
    await press({ key: 'Backspace', code: 'Backspace', altKey: true })
    expect(warn).toHaveBeenCalledTimes(1)
    expect(warn.mock.calls[0]![0]).toContain('act-end-game')
    expect(warn.mock.calls[0]![0]).toContain('act-concede')
    warn.mockRestore()
    view.unmount()
  })

  it('says nothing when only one of them is live', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    // Shuffle and Rotate are the other legitimate pair on one chord: a game
    // has one or the other, never both.
    const { runs, view } = setup(
      ['act-shuffle', {}],
      ['act-rotate', { describe: () => 'disabled' as ActionState }],
    )
    await press({ key: 'Ω', code: 'KeyZ', altKey: true })
    expect(warn).not.toHaveBeenCalled()
    // …and the live one still answered, so the silence is not the key going
    // nowhere.
    expect(runs[0]).toHaveBeenCalledTimes(1)
    warn.mockRestore()
    view.unmount()
  })

  it('says nothing about one command offered twice — that pair is written not to collide', async () => {
    // A game's End and the pause overlay's are the same command in two places.
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const { runs, view } = setup(['act-new-game', {}], ['act-new-game', {}])
    await press({ key: '+' })
    expect(warn).not.toHaveBeenCalled()
    // One of them answers, once — the tie is silent, not undecided.
    expect(runs[0]).toHaveBeenCalledTimes(1)
    expect(runs[1]).not.toHaveBeenCalled()
    warn.mockRestore()
    view.unmount()
  })
})
