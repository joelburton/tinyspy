// cs-blessed-keyboard

/**
 * Tests for the shared capture-key CORE — the universal pieces every key-capture
 * game relies on (so they can't drift): the letter append, Backspace, Enter, the
 * length cap, the stored case, the disabled/busy gating, and what the Submit
 * binding says about itself. The hook binds actions, and the keys reach them
 * through the action dispatcher (mounted here). The history arrows are a
 * separate layer — see useArrowHistory.test.ts.
 */
import { act, renderHook } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { asciiLetters, useCaptureKeys, type CaptureKeysOptions } from './useCaptureKeys'
import { useActionDispatcher } from '../actions/dispatcher'

/** Dispatch a window keydown, the way the dispatcher listens for it. Awaited,
 *  because an action's run settles a microtask after the key. */
async function press(key: string) {
  await act(async () => {
    window.dispatchEvent(new KeyboardEvent('keydown', { key, bubbles: true }))
  })
}

/** Render the hook with stable mock callbacks; returns them + a rerender helper,
 *  and the two bindings the hook hands back for the word-entry row's buttons. */
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
  const { result, rerender } = renderHook(
    (props: CaptureKeysOptions) => {
      useActionDispatcher()
      return useCaptureKeys(props)
    },
    { initialProps: base },
  )
  return {
    onChange,
    onSubmit,
    onAnyKey,
    result,
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

  it('busy freezes the entry but still lets a key dismiss feedback', async () => {
    const { onChange, onSubmit, onAnyKey } = setup({ value: 'ca', busy: true })
    await press('t')
    await press('Backspace')
    await press('Enter')
    expect(onChange).not.toHaveBeenCalled()
    expect(onSubmit).not.toHaveBeenCalled()
    // The watcher claims nothing and runs regardless of who else is frozen.
    expect(onAnyKey).toHaveBeenCalled()
  })

  it('stops at maxLength — a further letter is dropped', async () => {
    const { onChange } = setup({ value: 'cat', maxLength: 3 })
    await press('s')
    expect(onChange).not.toHaveBeenCalled()
  })

  it("stores uppercase with asciiLetters('upper')", async () => {
    const { onChange } = setup({ value: 'CA', charFor: asciiLetters('upper') })
    await press('t')
    expect(onChange).toHaveBeenCalledWith('CAT')
  })

  it('a letter that types ALSO dismisses feedback — the watcher does not claim the key', async () => {
    const { onChange, onAnyKey } = setup({ value: 'ca' })
    await press('t')
    expect(onAnyKey).toHaveBeenCalledTimes(1)
    expect(onChange).toHaveBeenCalledWith('cat')
  })
})

describe('useCaptureKeys — what Submit says about itself', () => {
  // `disabled` rather than `hidden`: the control stays on the row and grays,
  // because the entry is here and it is the VALUE that cannot go.
  it('is disabled, not hidden, on an empty entry', () => {
    const { result } = setup({ value: '' })
    expect(result.current.actSubmitEntry.describe('button').state).toBe('disabled')
  })

  it('is disabled, not hidden, when the value is vetoed (submitDisabled)', () => {
    const { result } = setup({ value: 'cat', submitDisabled: true })
    expect(result.current.actSubmitEntry.describe('button').state).toBe('disabled')
  })

  it('is active with a value it may submit', () => {
    const { result } = setup({ value: 'cat' })
    expect(result.current.actSubmitEntry.describe('button').state).toBe('active')
  })
})
