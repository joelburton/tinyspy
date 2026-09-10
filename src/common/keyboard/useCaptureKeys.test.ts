// cs-audited-keyboard

/**
 * Tests for the shared capture-key CORE — the universal pieces every key-capture
 * game relies on (so they can't drift): the letter append, Backspace, Enter, and
 * the disabled/busy gating. The hook reads keystrokes off the window via
 * useGlobalKeyHandler. The EntryBox-only history arrows are a separate layer —
 * see useArrowHistory.test.ts.
 */
import { act, renderHook } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { useCaptureKeys, type CaptureKeysOptions } from './useCaptureKeys'
import { useActionDispatcher } from '../actions/dispatcher'

/** Dispatch a window keydown, the way the dispatcher listens for it. Awaited,
 *  because an action's run settles a microtask after the key. */
async function press(key: string) {
  await act(async () => {
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
  const { rerender } = renderHook(
    (props: CaptureKeysOptions) => {
      useActionDispatcher()
      useCaptureKeys(props)
    },
    { initialProps: base },
  )
  return {
    onChange,
    onSubmit,
    onAnyKey,
    update: (next: Partial<CaptureKeysOptions>) => rerender({ ...base, ...next }),
  }
}

describe('useCaptureKeys — core entry', () => {
  it('appends a letter (default lowercase charFor)', async () => {
    const { onChange } = setup({ value: 'ca' })
    await press('t')
    expect(onChange).toHaveBeenCalledWith('cat')
  })

  it('Backspace deletes the last character', async () => {
    const { onChange } = setup({ value: 'cat' })
    await press('Backspace')
    expect(onChange).toHaveBeenCalledWith('ca')
  })

  it('Enter submits a non-empty value, but not an empty one', async () => {
    const { onSubmit, update } = setup({ value: 'cat' })
    await press('Enter')
    expect(onSubmit).toHaveBeenCalledTimes(1)
    update({ value: '' })
    await press('Enter')
    expect(onSubmit).toHaveBeenCalledTimes(1) // unchanged — empty Enter doesn't submit
  })

  it('disabled stops the ENTRY dead (no edits, no submit, no dismissal)', async () => {
    const { onChange, onAnyKey, onSubmit } = setup({ value: 'ca', disabled: true })
    await press('t')
    await press('Backspace')
    await press('Enter')
    expect(onChange).not.toHaveBeenCalled()
    expect(onSubmit).not.toHaveBeenCalled()
    // The dismissal is gated too, so a stray key can't wipe the terminal pill.
    expect(onAnyKey).not.toHaveBeenCalled()
  })
})
