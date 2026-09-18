// cs-audited-word-entry

/**
 * Tests for the history arrows: ArrowUp recalls the last entry, ArrowDown
 * clears it, both no-op while the entry is gone or frozen or where the game
 * keeps no history at all, they inherit the dispatcher's focused-field gate,
 * and each says the right thing about itself.
 *
 * The arrows are bound actions, so the harness mounts the app's key dispatcher
 * beside the hook and presses real keydowns.
 */
import { act, renderHook } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { useArrowHistory, type ArrowHistoryOptions } from './useArrowHistory'
import { useActionDispatcher } from '../actions/dispatcher'
import { liveBindings } from '../actions/useBoundAction'

/** Awaited: an action's run settles a microtask after the key. */
async function press(key: string, target: EventTarget = window) {
  await act(async () => {
    target.dispatchEvent(new KeyboardEvent('keydown', { key, bubbles: true }))
  })
}

function setup(initial: Partial<ArrowHistoryOptions> = {}) {
  const onChange = vi.fn()
  renderHook(() => {
    useActionDispatcher()
    useArrowHistory({ onChange, ...initial })
  })
  return { onChange }
}

/** What the two arrow bindings say about themselves, by id — read off the
 *  stack, since the hook hands nothing back. */
function states() {
  const byId = (id: string) => liveBindings().find((b) => b.id === id)!.describe('button').state
  return { recall: byId('act-recall-last'), clear: byId('act-clear-entry') }
}

describe('useArrowHistory', () => {
  afterEach(() => {
    document.body.innerHTML = ''
  })

  it('ArrowUp recalls the last submitted value', async () => {
    const { onChange } = setup({ recall: 'crane' })
    await press('ArrowUp')
    expect(onChange).toHaveBeenCalledWith('crane')
  })

  it('ArrowUp is a no-op when there is nothing to recall', async () => {
    const { onChange } = setup({ recall: '' })
    await press('ArrowUp')
    expect(onChange).not.toHaveBeenCalled()
  })

  it('ArrowDown clears the entry', async () => {
    const { onChange } = setup({ recall: 'crane' })
    await press('ArrowDown')
    expect(onChange).toHaveBeenCalledWith('')
  })

  it('does nothing while the entry is gone (disabled — loading / terminal)', async () => {
    const { onChange } = setup({ recall: 'crane', disabled: true })
    await press('ArrowUp')
    await press('ArrowDown')
    expect(onChange).not.toHaveBeenCalled()
  })

  it('does nothing while a submit is in flight (busy)', async () => {
    const { onChange } = setup({ recall: 'crane', busy: true })
    await press('ArrowUp')
    await press('ArrowDown')
    expect(onChange).not.toHaveBeenCalled()
  })

  it('neither arrow acts for a game that keeps no history', async () => {
    const { onChange } = setup({ hasHistory: false })
    await press('ArrowUp')
    await press('ArrowDown')
    expect(onChange).not.toHaveBeenCalled()
  })

  it('ignores arrows aimed at a focused text field (chat / a game input)', async () => {
    const { onChange } = setup({ recall: 'crane' })
    const input = document.createElement('input')
    document.body.append(input)
    await press('ArrowUp', input)
    expect(onChange).not.toHaveBeenCalled()
  })

  describe('what the two arrows say about themselves', () => {
    // The two gates say different things, exactly as the capture core's do:
    // gone takes the keys off the list, frozen keeps them there and grays them.
    // Same words for all four keys on the row, so a submit neither blinks two
    // rows out of Help nor drops the arrows through to the browser.
    it('both hidden while the entry is gone (disabled)', () => {
      setup({ recall: 'crane', disabled: true })
      expect(states()).toEqual({ recall: 'hidden', clear: 'hidden' })
    })

    it('both disabled while a submit is in flight (busy)', () => {
      setup({ recall: 'crane', busy: true })
      expect(states()).toEqual({ recall: 'disabled', clear: 'disabled' })
    })

    it('recall is disabled and clear is active with nothing to bring back', () => {
      setup({ recall: '' })
      expect(states()).toEqual({ recall: 'disabled', clear: 'active' })
    })

    it('both active once there is a last entry', () => {
      setup({ recall: 'WORD' })
      expect(states()).toEqual({ recall: 'active', clear: 'active' })
    })

    // The distinction `recall` alone cannot draw: '' above is "offered, nothing
    // yet", while a game with no history at all wants both keys GONE — Help
    // draws a disabled key like a live one, so a listed key that can never act
    // reads as one that works.
    it('both hidden for a game that keeps no history', () => {
      setup({ hasHistory: false })
      expect(states()).toEqual({ recall: 'hidden', clear: 'hidden' })
    })

    it('a history game with nothing submitted yet is NOT the no-history case', () => {
      setup({ recall: '', hasHistory: true })
      expect(states().recall).toBe('disabled')
    })
  })
})
