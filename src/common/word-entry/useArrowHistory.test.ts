// cs-unmet

/**
 * Tests for the EntryBox-only history arrows (split out of useCaptureKeys): ArrowUp
 * recalls the last entry, ArrowDown clears it, both no-op while disabled, they
 * inherit the dispatcher's focused-field gate, and each says the right thing
 * about itself. These apply to the EntryBox games only — a key-capture game that
 * isn't an EntryBox (wordle) never wires this.
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
  const byId = (id: string) => liveBindings().find((b) => b.id === id)!.describe().state
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

  it('does nothing while disabled (enabled: false — terminal / mid-submit)', async () => {
    const { onChange } = setup({ recall: 'crane', enabled: false })
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
    it('both hidden while the arrows are off', () => {
      setup({ recall: 'crane', enabled: false })
      expect(states()).toEqual({ recall: 'hidden', clear: 'hidden' })
    })

    // Pins what the code does TODAY. `todo.md` in this folder records that a
    // caller offering no recall at all (`recall` omitted) should get `hidden`
    // here rather than `disabled`; when that lands, this case splits in two —
    // omitted → hidden, '' → disabled.
    it('recall is disabled and clear is active with nothing to bring back', () => {
      setup({ recall: '' })
      expect(states()).toEqual({ recall: 'disabled', clear: 'active' })
    })

    it('both active once there is a last entry', () => {
      setup({ recall: 'WORD' })
      expect(states()).toEqual({ recall: 'active', clear: 'active' })
    })
  })
})
