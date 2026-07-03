/**
 * Tests for the EntryBox-only history arrows (split out of useCaptureKeys): ArrowUp
 * recalls the last entry, ArrowDown clears it, both no-op while disabled, and it
 * inherits useGlobalKeyHandler's focused-input guard. These apply to the EntryBox
 * games only — a key-capture game that isn't an EntryBox (wordle) never wires this.
 */
import { act, renderHook } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { useArrowHistory, type ArrowHistoryOptions } from './useArrowHistory'

function press(key: string, target: EventTarget = window) {
  act(() => {
    target.dispatchEvent(new KeyboardEvent('keydown', { key, bubbles: true }))
  })
}

function setup(initial: Partial<ArrowHistoryOptions> = {}) {
  const onChange = vi.fn()
  renderHook(() => useArrowHistory({ onChange, ...initial }))
  return { onChange }
}

describe('useArrowHistory', () => {
  afterEach(() => {
    document.body.innerHTML = ''
  })

  it('ArrowUp recalls the last submitted value', () => {
    const { onChange } = setup({ recall: 'crane' })
    press('ArrowUp')
    expect(onChange).toHaveBeenCalledWith('crane')
  })

  it('ArrowUp is a no-op when there is nothing to recall', () => {
    const { onChange } = setup({ recall: '' })
    press('ArrowUp')
    expect(onChange).not.toHaveBeenCalled()
  })

  it('ArrowDown clears the entry', () => {
    const { onChange } = setup({ recall: 'crane' })
    press('ArrowDown')
    expect(onChange).toHaveBeenCalledWith('')
  })

  it('does nothing while disabled (enabled: false — terminal / mid-submit)', () => {
    const { onChange } = setup({ recall: 'crane', enabled: false })
    press('ArrowUp')
    press('ArrowDown')
    expect(onChange).not.toHaveBeenCalled()
  })

  it('ignores arrows aimed at a focused text field (chat / a game input)', () => {
    const { onChange } = setup({ recall: 'crane' })
    const input = document.createElement('input')
    document.body.append(input)
    press('ArrowUp', input)
    expect(onChange).not.toHaveBeenCalled()
  })
})
