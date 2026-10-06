// cs-blessed-board-cursor

import { act, renderHook } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { useActionDispatcher } from '@/common/actions/useActionDispatcher'
import { getActions } from '@/common/actions/actionsStore'
import { useBoardCursorKeys, type BoardCursorKeysOptions } from './useBoardCursorKeys'

// The shared 2-D board-cursor keyboard: arrows move the cursor, a letter
// places, Backspace removes, and the submit fires on the keys its OWN action
// carries — Enter for a submit, Enter or Space for a peel. Everything is inert
// while disabled, and each action says so — the submit on its own narrower
// gate, the rest together on `enabled`.
//
// The dispatcher's gates are NOT retested here: a modified chord never matches
// a pattern, a keystroke aimed at chat never reaches an action, and dismissing
// feedback or leaving a turn viewer are their own actions that the dispatcher
// runs first. `chord.test.ts` and `useActionDispatcher.test.tsx` own all of
// that.

/** A real window keydown. Awaited: an action's run settles a microtask later. */
async function press(key: string) {
  await act(async () => {
    document.body.dispatchEvent(new KeyboardEvent('keydown', { key, bubbles: true }))
  })
}

function setup(over: Partial<BoardCursorKeysOptions> = {}) {
  const cb = {
    onArrow: vi.fn(),
    onLetter: vi.fn(),
    onBackspace: vi.fn(),
    onSubmit: vi.fn(),
  }
  const view = renderHook(() => {
    useActionDispatcher()
    useBoardCursorKeys({ enabled: true, submit: 'act-submit', ...cb, ...over })
  })
  return { ...cb, view }
}

describe('useBoardCursorKeys', () => {
  it('maps arrows → onArrow, a letter → onLetter (lowercase, Shift or not), Backspace, Enter', async () => {
    const cb = setup()
    await press('ArrowLeft')
    await press('a')
    await press('B')
    await press('Backspace')
    await press('Enter')
    expect(cb.onArrow).toHaveBeenCalledWith('ArrowLeft')
    expect(cb.onLetter).toHaveBeenNthCalledWith(1, 'a')
    expect(cb.onLetter).toHaveBeenNthCalledWith(2, 'b')
    expect(cb.onBackspace).toHaveBeenCalledTimes(1)
    expect(cb.onSubmit).toHaveBeenCalledTimes(1)
    cb.view.unmount()
  })

  // Which keys submit is the ACTION's business, not a flag here: `act-submit`
  // carries Enter, `act-peel` carries Enter and Space.
  it('Space submits only for a peel', async () => {
    const submit = setup()
    await press(' ')
    expect(submit.onSubmit).not.toHaveBeenCalled()
    submit.view.unmount()

    const peel = setup({ submit: 'act-peel' })
    await press(' ')
    expect(peel.onSubmit).toHaveBeenCalledTimes(1)
    peel.view.unmount()
  })

  it('hands back the submit action, so a game can place it as a button', async () => {
    const cb = vi.fn()
    const { result, unmount } = renderHook(() =>
      useBoardCursorKeys({
        enabled: true,
        submit: 'act-peel',
        onArrow: vi.fn(),
        onLetter: vi.fn(),
        onBackspace: vi.fn(),
        onSubmit: cb,
      }),
    )
    expect(result.current.actSubmit.id).toBe('act-peel')
    await act(async () => result.current.actSubmit.run())
    expect(cb).toHaveBeenCalledTimes(1)
    unmount()
  })

  it('the submit has its OWN availability, narrower than the cursor keys', async () => {
    // A move that isn't available yet, while the board keeps moving.
    const cb = setup({ canSubmit: false })
    await press('Enter')
    await press('a')
    expect(cb.onSubmit).not.toHaveBeenCalled()
    expect(cb.onLetter).toHaveBeenCalledWith('a')
    cb.view.unmount()
  })

  it('while disabled, every one of them is inert', async () => {
    const cb = setup({ enabled: false })
    await press('a')
    await press('ArrowLeft')
    await press('Backspace')
    await press('Enter')
    expect(cb.onLetter).not.toHaveBeenCalled()
    expect(cb.onArrow).not.toHaveBeenCalled()
    expect(cb.onBackspace).not.toHaveBeenCalled()
    expect(cb.onSubmit).not.toHaveBeenCalled()
    cb.view.unmount()
  })

  describe('what the four say about themselves', () => {
    // Each action's state by id, read off the stack the dispatcher reads.
    const states = () =>
      Object.fromEntries(getActions().map((b) => [b.id, b.describe('button').state]))

    it('with canSubmit false only the submit is disabled; the cursor keys stay live', () => {
      const cb = setup({ canSubmit: false })
      expect(states()).toEqual({
        'act-move-cursor': 'active',
        'act-place-tile': 'active',
        'act-remove-tile': 'active',
        'act-submit': 'disabled',
      })
      cb.view.unmount()
    })

    // Disabled rather than hidden to the keyboard: the keys are still this
    // board's keys, so the help list keeps them and grays them, and a disabled
    // match still keeps the key from the browser (Space does not scroll the
    // page). The submit's button alone goes: an inert board has no move.
    it('with enabled false all four are disabled, and the submit button goes', () => {
      const cb = setup({ enabled: false })
      expect(states()).toEqual({
        'act-move-cursor': 'disabled',
        'act-place-tile': 'disabled',
        'act-remove-tile': 'disabled',
        'act-submit': 'hidden',
      })
      expect(getActions().find((b) => b.id === 'act-submit')!.describe('key').state).toBe('disabled')
      cb.view.unmount()
    })
  })
})
