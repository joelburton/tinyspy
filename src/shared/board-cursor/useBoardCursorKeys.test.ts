// cs-audited-board-cursor

/**
 * Tests for the shared 2-D board-cursor keyboard (bananagrams + scrabble): arrows
 * move the cursor, a letter places, Backspace removes, and the commit fires on
 * the keys its OWN action carries — Enter for a submit, Enter or Space for a
 * peel. Everything is inert while disabled, and each binding says so — the
 * commit on its own narrower gate, the four together on `enabled`.
 *
 * The gates are NOT retested here. They stopped being this hook's work when its
 * keys became bound actions: a modified chord never matches a pattern, a
 * keystroke aimed at chat never reaches an action, and dismissing feedback or
 * leaving a turn viewer are their own actions that the dispatcher runs first.
 * `chord.test.ts` and `dispatcher.test.tsx` own all of that.
 */
import { act, renderHook } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { useActionDispatcher } from '@/common/actions/dispatcher'
import { liveBindings } from '@/common/actions/useBoundAction'
import { useBoardCursorKeys, type BoardCursorKeysOptions } from './useBoardCursorKeys'

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
    // bananagrams peels only once the hand is empty; scrabble plays only a
    // staged word. The board keeps moving meanwhile.
    const cb = setup({ canCommit: false })
    await press('Enter')
    await press('a')
    expect(cb.onCommit).not.toHaveBeenCalled()
    expect(cb.onLetter).toHaveBeenCalledWith('A')
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
    expect(cb.onCommit).not.toHaveBeenCalled()
    cb.view.unmount()
  })

  describe('what the four say about themselves', () => {
    /** Each binding's state by id, read off the stack the dispatcher reads. */
    const states = () =>
      Object.fromEntries(liveBindings().map((b) => [b.id, b.describe('button').state]))

    it('with canCommit false only the commit is disabled; the cursor keys stay live', () => {
      const cb = setup({ canCommit: false })
      expect(states()).toEqual({
        'act-move-cursor': 'active',
        'act-place-tile': 'active',
        'act-remove-tile': 'active',
        'act-submit': 'disabled',
      })
      cb.view.unmount()
    })

    // Disabled rather than hidden: the keys are still this board's keys, so
    // the help list keeps them and grays them, and a disabled match still
    // keeps the key from the browser (Space does not scroll the page).
    it('with enabled false all four are disabled', () => {
      const cb = setup({ enabled: false })
      expect(states()).toEqual({
        'act-move-cursor': 'disabled',
        'act-place-tile': 'disabled',
        'act-remove-tile': 'disabled',
        'act-submit': 'disabled',
      })
      cb.view.unmount()
    })
  })
})
