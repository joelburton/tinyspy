/**
 * Tests for PauseBoundary. The component's job is small but its
 * load-bearing property is the unmount-vs-hide choice: paused →
 * children must actually leave the DOM (not visibility:hidden),
 * because per-game PlayArea state — pending inputs, transient
 * shake animations, broadcast subscriptions — relies on the
 * unmount to reset cleanly on resume. A future refactor that
 * "optimized" the boundary by toggling visibility would silently
 * break the reset-on-pause contract; these tests document it.
 *
 * What's covered:
 *   - paused=false: children render, overlay is absent
 *   - paused=true: children are NOT rendered, overlay renders
 *   - paused toggle remounts children (mount-counter assertion)
 *   - presence-only pause: missing-list copy in overlay
 *   - manual pause: "X paused the game" + Resume button
 *
 * Not covered: the precise PauseOverlay copy variants (those
 * belong with PauseOverlay's own future tests). Here we treat the
 * overlay as a black box and just confirm it's present/absent.
 */

import { useEffect, useRef } from 'react'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { PauseBoundary } from './PauseBoundary'
import type { Member } from '../lib/games'

const ADA: Member = {
  user_id: 'ada',
  username: 'ada',
  color: 'red',
}
const BEA: Member = {
  user_id: 'bea',
  username: 'bea',
  color: 'blue',
}

/** A child that increments an external counter every time it
 *  mounts. Used to assert that unmount-on-pause + remount-on-
 *  resume actually fires. */
function MountCounterChild({ count }: { count: { value: number } }) {
  // Use a ref guard so React 18+ StrictMode double-invoke doesn't
  // double-count effect bodies; we only want to count real mounts.
  const incremented = useRef(false)
  useEffect(() => {
    if (incremented.current) return
    incremented.current = true
    count.value += 1
  }, [count])
  return <div data-testid="child">child</div>
}

describe('PauseBoundary', () => {
  it('renders children when paused=false', () => {
    render(
      <PauseBoundary paused={false} missing={[]}>
        <div data-testid="child">play surface</div>
      </PauseBoundary>,
    )
    expect(screen.getByTestId('child')).toBeInTheDocument()
    expect(screen.queryByRole('status')).not.toBeInTheDocument()
  })

  it('hides children and renders the overlay when paused=true (presence)', () => {
    render(
      <PauseBoundary paused={true} missing={[BEA]}>
        <div data-testid="child">play surface</div>
      </PauseBoundary>,
    )
    expect(screen.queryByTestId('child')).not.toBeInTheDocument()
    expect(screen.getByRole('status')).toBeInTheDocument()
  })

  it('remounts children when paused toggles true→false (i.e., children unmount, not visibility:hidden)', () => {
    const count = { value: 0 }
    const { rerender } = render(
      <PauseBoundary paused={false} missing={[]}>
        <MountCounterChild count={count} />
      </PauseBoundary>,
    )
    expect(count.value).toBe(1)

    // Pause: child unmounts. Counter stays at 1.
    rerender(
      <PauseBoundary paused={true} missing={[BEA]}>
        <MountCounterChild count={count} />
      </PauseBoundary>,
    )
    expect(screen.queryByTestId('child')).not.toBeInTheDocument()
    expect(count.value).toBe(1)

    // Resume: child remounts. Counter increments — the proof that
    // the previous unmount actually happened.
    rerender(
      <PauseBoundary paused={false} missing={[]}>
        <MountCounterChild count={count} />
      </PauseBoundary>,
    )
    expect(screen.getByTestId('child')).toBeInTheDocument()
    expect(count.value).toBe(2)
  })

  it('shows the missing peer name in the presence-pause copy', () => {
    render(
      <PauseBoundary paused={true} missing={[BEA]}>
        <div>play</div>
      </PauseBoundary>,
    )
    expect(
      screen.getByText(/Waiting for/),
    ).toBeInTheDocument()
    expect(screen.getByText('bea')).toBeInTheDocument()
  })

  it('renders manual-pause copy + Resume button when manuallyPausedBy is set', async () => {
    const user = userEvent.setup()
    const onResume = vi.fn()
    render(
      <PauseBoundary
        paused={true}
        missing={[]}
        manuallyPausedBy={ADA}
        onResume={onResume}
      >
        <div>play</div>
      </PauseBoundary>,
    )
    expect(screen.getByText(/paused the game/)).toBeInTheDocument()
    const resume = screen.getByRole('button', { name: 'Resume' })
    await user.click(resume)
    expect(onResume).toHaveBeenCalledTimes(1)
  })
})
