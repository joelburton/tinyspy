/**
 * Tests for the shared capture-key helper — focused on the universal pieces every
 * capture game relies on (so they can't drift): the last-move history (ArrowUp
 * recalls `recall`, ArrowDown clears), plus the core append / Enter / disabled /
 * busy gating. The hook reads keystrokes off the window via useGlobalKeyHandler.
 */
import { act, renderHook } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { useCaptureKeys, type CaptureKeysOptions } from './useCaptureKeys'

/** Dispatch a window keydown, the way useGlobalKeyHandler listens for it. */
function press(key: string) {
  act(() => {
    window.dispatchEvent(new KeyboardEvent('keydown', { key, bubbles: true }))
  })
}

/** Render the hook with stable mock callbacks; returns them + a rerender helper. */
function setup(initial: Partial<CaptureKeysOptions> = {}) {
  const onChange = vi.fn()
  const onSubmit = vi.fn()
  const onAnyKey = vi.fn()
  const base: CaptureKeysOptions = {
    value: '',
    onChange,
    onSubmit,
    onAnyKey,
    ...initial,
  }
  const { rerender } = renderHook((props: CaptureKeysOptions) => useCaptureKeys(props), {
    initialProps: base,
  })
  return {
    onChange,
    onSubmit,
    onAnyKey,
    update: (next: Partial<CaptureKeysOptions>) => rerender({ ...base, ...next }),
  }
}

describe('useCaptureKeys — last-move history (universal)', () => {
  it('ArrowUp recalls the last submitted value', () => {
    const { onChange } = setup({ value: '', recall: 'crane' })
    press('ArrowUp')
    expect(onChange).toHaveBeenCalledWith('crane')
  })

  it('ArrowUp is a no-op when there is nothing to recall', () => {
    const { onChange } = setup({ value: '', recall: '' })
    press('ArrowUp')
    expect(onChange).not.toHaveBeenCalled()
  })

  it('ArrowDown clears the entry', () => {
    const { onChange } = setup({ value: 'crane', recall: 'crane' })
    press('ArrowDown')
    expect(onChange).toHaveBeenCalledWith('')
  })

  it('recall/clear are blocked while busy (but still dismiss feedback)', () => {
    const { onChange, onAnyKey } = setup({ value: 'cr', recall: 'crane', busy: true })
    press('ArrowDown')
    expect(onChange).not.toHaveBeenCalled()
    expect(onAnyKey).toHaveBeenCalled() // dismissal runs even mid-submit
  })
})

describe('useCaptureKeys — core entry', () => {
  it('appends a letter (default lowercase charFor)', () => {
    const { onChange } = setup({ value: 'ca' })
    press('t')
    expect(onChange).toHaveBeenCalledWith('cat')
  })

  it('Backspace deletes the last character', () => {
    const { onChange } = setup({ value: 'cat' })
    press('Backspace')
    expect(onChange).toHaveBeenCalledWith('ca')
  })

  it('Enter submits a non-empty value, but not an empty one', () => {
    const { onSubmit, update } = setup({ value: 'cat' })
    press('Enter')
    expect(onSubmit).toHaveBeenCalledTimes(1)
    update({ value: '' })
    press('Enter')
    expect(onSubmit).toHaveBeenCalledTimes(1) // unchanged — empty Enter doesn't submit
  })

  it('disabled is a complete no-op (no dispatch, no dismissal)', () => {
    const { onChange, onAnyKey } = setup({ value: 'ca', disabled: true })
    press('t')
    press('ArrowDown')
    expect(onChange).not.toHaveBeenCalled()
    expect(onAnyKey).not.toHaveBeenCalled()
  })
})
