// cs-unmet

import { render, screen } from '@testing-library/react'
import { act } from 'react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { ToastHost } from './ToastHost'
import { DEFAULT_TOAST_MS } from './Toast'
import { showToast, dismissToast } from '../../lib/toast/toastStore'

/**
 * A toast's two lifetimes (docs/ui.md → Toasts): with an `ms` it self-clears,
 * without one it waits for a person. Both halves fail silently in production —
 * an announcement that quietly expired leaves nothing on screen to report.
 *
 * **These must go through `<ToastHost>` and the real store.** "It goes away" is
 * a fact about the STORE: the card's timer calls `dismissToast`, so a card
 * rendered on its own sits there forever and every assertion here passes
 * vacuously.
 */

/** Ids shown in a test, so the module-level store can't leak into the next. */
const shown: string[] = []
function show(...args: Parameters<typeof showToast>): string {
  const id = showToast(...args)
  shown.push(id)
  return id
}

afterEach(() => {
  act(() => {
    for (const id of shown.splice(0)) dismissToast(id)
  })
  vi.useRealTimers()
})

describe('Toast — when it goes away by itself', () => {
  it('self-clears after its ms', () => {
    vi.useFakeTimers()
    render(<ToastHost />)
    act(() => void show({ message: 'Wordle deleted', ms: DEFAULT_TOAST_MS }))
    expect(screen.getByText('Wordle deleted')).toBeTruthy()

    // One tick short: still there. This half is what proves the timer removed
    // it, rather than a render that never happened.
    act(() => void vi.advanceTimersByTime(DEFAULT_TOAST_MS - 1))
    expect(screen.queryByText('Wordle deleted')).toBeTruthy()

    act(() => void vi.advanceTimersByTime(1))
    expect(screen.queryByText('Wordle deleted')).toBeNull()
  })

  it('waits for a person when there is no ms', () => {
    vi.useFakeTimers()
    render(<ToastHost />)
    act(() => void show({ message: 'Moth invited you' }))
    act(() => void vi.advanceTimersByTime(DEFAULT_TOAST_MS * 100))
    expect(screen.queryByText('Moth invited you')).toBeTruthy()
  })

  it('does NOT fire onClose when it times out — nobody dismissed it', () => {
    vi.useFakeTimers()
    const onClose = vi.fn()
    render(<ToastHost />)
    act(() => void show({ message: 'Wordle deleted', ms: DEFAULT_TOAST_MS, onClose }))
    act(() => void vi.advanceTimersByTime(DEFAULT_TOAST_MS))
    expect(screen.queryByText('Wordle deleted')).toBeNull()
    expect(onClose).not.toHaveBeenCalled()
  })
})
