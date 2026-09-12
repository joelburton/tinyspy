// cs-blessed-common-hosts

import { render, screen } from '@testing-library/react'
import { act } from 'react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { ToastHost } from './ToastHost'
import { showToast, dismissToast, DEFAULT_TOAST_MS } from './toastStore'

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

/**
 * The two exits a person can take, which differ in ONE way that matters: the
 * ✕ fires `onClose` and the action button does not. An invitation is what
 * rides on it — dismissing one marks it handled so it never returns, joining
 * one must not, because the invite drops out on its own once you are in the
 * game. Get this backwards and a joined game's invite is marked dismissed, or
 * a dismissed one comes back.
 */
describe('Toast — the two exits a person can take', () => {
  it('the ✕ fires onClose, then removes', () => {
    const onClose = vi.fn()
    render(<ToastHost />)
    act(() => void show({ message: 'Moth invited you', onClose }))

    act(() => void screen.getByRole('button', { name: 'Dismiss' }).click())
    expect(onClose).toHaveBeenCalledTimes(1)
    expect(screen.queryByText('Moth invited you')).toBeNull()
  })

  it('the action runs and removes, WITHOUT firing onClose', () => {
    const onClose = vi.fn()
    const onClick = vi.fn()
    render(<ToastHost />)
    act(() => void show({ message: 'Moth invited you', onClose, action: { label: 'Join', onClick } }))

    act(() => void screen.getByRole('button', { name: 'Join' }).click())
    expect(onClick).toHaveBeenCalledTimes(1)
    expect(onClose, 'acting on an announcement is not dismissing it').not.toHaveBeenCalled()
    expect(screen.queryByText('Moth invited you')).toBeNull()
  })

  it('an action with keepOpen runs and leaves the toast up', () => {
    const onClick = vi.fn()
    render(<ToastHost />)
    act(() =>
      void show({ message: 'Still here', action: { label: 'Undo', onClick, keepOpen: true } }),
    )

    act(() => void screen.getByRole('button', { name: 'Undo' }).click())
    expect(onClick).toHaveBeenCalledTimes(1)
    expect(screen.getByText('Still here')).toBeTruthy()
  })

  it('no ✕ at all when dismissible is false', () => {
    render(<ToastHost />)
    act(() => void show({ message: 'Bea is setting up a game', dismissible: false }))
    expect(screen.queryByRole('button', { name: 'Dismiss' })).toBeNull()
  })
})
