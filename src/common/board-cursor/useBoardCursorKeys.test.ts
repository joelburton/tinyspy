// cs-blessed-board-cursor

import { act, renderHook } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { useActionDispatcher } from '@/common/actions/dispatcher'
import { liveBindings } from '@/common/actions/useBoundAction'
import { useBoardCursorKeys, type BoardCursorKeysOptions } from './useBoardCursorKeys'

// The shared 2-D board-cursor keyboard: arrows move the cursor, a letter
// places, Backspace removes, Space picks, and the commit fires on the keys its
// OWN action carries — Enter for a submit, Enter or Space for a peel. Everything
// is inert while disabled, and each binding says so — the commit on its own
// narrower gate, the rest together on `enabled`. A key the board has no
// callback for is hidden, and the keystroke goes on to the browser.
//
// The dispatcher's gates are NOT retested here: a modified chord never matches
// a pattern, a keystroke aimed at chat never reaches an action, and dismissing
// feedback or leaving a turn viewer are their own actions that the dispatcher
// runs first. `chord.test.ts` and `dispatcher.test.tsx` own all of that.

/** A real window keydown. Awaited: an action's run settles a microtask later.
 *  Returns the event, so a test can ask whether anything claimed it. */
async function press(key: string) {
  const event = new KeyboardEvent('keydown', { key, bubbles: true, cancelable: true })
  await act(async () => {
    document.body.dispatchEvent(event)
  })
  return event
}

function setup(over: Partial<BoardCursorKeysOptions> = {}) {
  const cb = {
    onArrow: vi.fn(),
    onLetter: vi.fn(),
    onBackspace: vi.fn(),
    onCommit: vi.fn(),
  }
  const view = renderHook(() => {
    useActionDispatcher()
    useBoardCursorKeys({ enabled: true, commit: 'act-submit', ...cb, ...over })
  })
  return { ...cb, view }
}

describe('useBoardCursorKeys', () => {
  it('maps arrows → onArrow, a letter → onLetter (uppercased), Backspace, Enter', async () => {
    const cb = setup()
    await press('ArrowLeft')
    await press('a')
    await press('Backspace')
    await press('Enter')
    expect(cb.onArrow).toHaveBeenCalledWith('ArrowLeft')
    expect(cb.onLetter).toHaveBeenCalledWith('A')
    expect(cb.onBackspace).toHaveBeenCalledTimes(1)
    expect(cb.onCommit).toHaveBeenCalledTimes(1)
    cb.view.unmount()
  })

  // Which keys commit is the ACTION's business, not a flag here: `act-submit`
  // carries Enter, `act-peel` carries Enter and Space.
  it('Space commits only for a peel', async () => {
    const submit = setup()
    await press(' ')
    expect(submit.onCommit).not.toHaveBeenCalled()
    submit.view.unmount()

    const peel = setup({ commit: 'act-peel' })
    await press(' ')
    expect(peel.onCommit).toHaveBeenCalledTimes(1)
    peel.view.unmount()
  })

  // The picking board: arrows, Space and the commit, and nothing typed.
  it('Space → onToggle, for a board that picks', async () => {
    const onToggle = vi.fn()
    const cb = setup({ onToggle, onLetter: undefined, onBackspace: undefined })
    await press(' ')
    await press('ArrowDown')
    await press('Enter')
    expect(onToggle).toHaveBeenCalledTimes(1)
    expect(cb.onArrow).toHaveBeenCalledWith('ArrowDown')
    expect(cb.onCommit).toHaveBeenCalledTimes(1)
    cb.view.unmount()
  })

  // Hidden, not disabled: a disabled binding still keeps its key from the
  // browser, and a board with no letters has no business swallowing them.
  it('a key with no callback is left alone', async () => {
    const cb = setup({ onLetter: undefined, onBackspace: undefined })
    expect((await press('a')).defaultPrevented).toBe(false)
    expect((await press('Backspace')).defaultPrevented).toBe(false)
    expect((await press(' ')).defaultPrevented).toBe(false)
    cb.view.unmount()
  })

  it('hands back the commit binding, so a game can place it as a button', async () => {
    const cb = vi.fn()
    const { result, unmount } = renderHook(() =>
      useBoardCursorKeys({
        enabled: true,
        commit: 'act-peel',
        onArrow: vi.fn(),
        onLetter: vi.fn(),
        onBackspace: vi.fn(),
        onCommit: cb,
      }),
    )
    expect(result.current.actCommit.id).toBe('act-peel')
    await act(async () => result.current.actCommit.run())
    expect(cb).toHaveBeenCalledTimes(1)
    unmount()
  })

  it('the commit has its OWN availability, narrower than the cursor keys', async () => {
    // A move that isn't available yet, while the board keeps moving.
    const cb = setup({ canCommit: false })
    await press('Enter')
    await press('a')
    expect(cb.onCommit).not.toHaveBeenCalled()
    expect(cb.onLetter).toHaveBeenCalledWith('A')
    cb.view.unmount()
  })

  it('while disabled, every one of them is inert', async () => {
    const onToggle = vi.fn()
    const cb = setup({ enabled: false, onToggle })
    await press('a')
    await press('ArrowLeft')
    await press('Backspace')
    await press(' ')
    await press('Enter')
    expect(onToggle).not.toHaveBeenCalled()
    expect(cb.onLetter).not.toHaveBeenCalled()
    expect(cb.onArrow).not.toHaveBeenCalled()
    expect(cb.onBackspace).not.toHaveBeenCalled()
    expect(cb.onCommit).not.toHaveBeenCalled()
    cb.view.unmount()
  })

  describe('what the five say about themselves', () => {
    // Each binding's state by id, read off the stack the dispatcher reads.
    const states = () =>
      Object.fromEntries(liveBindings().map((b) => [b.id, b.describe('button').state]))

    it('with canCommit false only the commit is disabled; the cursor keys stay live', () => {
      const cb = setup({ canCommit: false })
      expect(states()).toEqual({
        'act-move-cursor': 'active',
        'act-place-tile': 'active',
        'act-remove-tile': 'active',
        'act-toggle-tile': 'hidden',
        'act-submit': 'disabled',
      })
      cb.view.unmount()
    })

    // Disabled rather than hidden: the keys are still this board's keys, so
    // the help list keeps them and grays them, and a disabled match still
    // keeps the key from the browser (Space does not scroll the page). A key
    // the board never had stays hidden.
    it('with enabled false every key the board has is disabled', () => {
      const cb = setup({ enabled: false })
      expect(states()).toEqual({
        'act-move-cursor': 'disabled',
        'act-place-tile': 'disabled',
        'act-remove-tile': 'disabled',
        'act-toggle-tile': 'hidden',
        'act-submit': 'disabled',
      })
      cb.view.unmount()
    })

    it('a picking board has no letters and no Backspace', () => {
      const cb = setup({ onToggle: vi.fn(), onLetter: undefined, onBackspace: undefined })
      expect(states()).toEqual({
        'act-move-cursor': 'active',
        'act-place-tile': 'hidden',
        'act-remove-tile': 'hidden',
        'act-toggle-tile': 'active',
        'act-submit': 'active',
      })
      cb.view.unmount()
    })
  })
})
