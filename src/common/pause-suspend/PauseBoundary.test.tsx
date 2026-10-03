// cs-blessed-pause-suspend

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
 *   - presence-only pause: the roster list, with the absent peer named
 *   - manual pause: "X paused the game" + Resume button
 *   - the Stop-game escape: placed from an action, and absent when that
 *     action says it is hidden
 *
 * The overlay is otherwise a black box here: its text is read only far enough
 * to tell the two pause sources apart, never asserted line by line.
 */

import { useEffect, useRef } from 'react'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { PauseBoundary } from './PauseBoundary'
import type { PauseActions } from './PauseOverlay'
import type { GamePause } from './pause'
import { ZTest_actionFixture } from '../actions/action.fixture'
import type { Member } from '../members/member'

const ADA: Member = {
  id: 'ada',
  username: 'ada',
  color: 'red',
}
const BEA: Member = {
  id: 'bea',
  username: 'bea',
  color: 'blue',
}
/** Nobody on the channel — every player passed in reads as absent. */
const NONE_PRESENT = new Set<string>()

/** A pause with nobody connected and no manual pause — what a spec that is
 *  not about the rest can use. Fresh mocks per call, so one spec's clicks
 *  never land in another's call count. */
function pauseOf(over: Partial<GamePause> = {}): GamePause {
  return {
    paused: true,
    presentUserIds: NONE_PRESENT,
    stillPlayingHumanPlayers: [],
    manuallyPausedBy: null,
    sendManualPause: vi.fn(),
    sendManualUnpause: vi.fn(),
    ...over,
  }
}

/** The two ways out, as the page binds them. */
function actionsOf(over: Partial<PauseActions> = {}): PauseActions {
  return {
    actBackToClub: ZTest_actionFixture('act-back-to-club'),
    actStopGame: ZTest_actionFixture('act-stop-game'),
    ...over,
  }
}

/** A child that increments an external counter every time it
 *  mounts. Used to assert that unmount-on-pause + remount-on-
 *  resume actually fires. */
function MountCounterChild({ onMount }: { onMount: () => void }) {
  // Use a ref guard so React 18+ StrictMode double-invoke doesn't
  // double-count effect bodies; we only want to count real mounts. A callback
  // (rather than a mutated counter argument) keeps the helper clear of the
  // argument-mutation the react-hooks immutability rule correctly forbids; a
  // fresh mount after an unmount gets a fresh `counted` ref, so it fires again.
  const counted = useRef(false)
  useEffect(function countRealMounts() {
    if (counted.current) return
    counted.current = true
    onMount()
  }, [onMount])
  return <div data-testid="child">child</div>
}

describe('PauseBoundary', () => {
  it('renders children when paused=false', () => {
    render(
      <PauseBoundary pause={pauseOf({ paused: false })} players={[]} actions={actionsOf()}>
        <div data-testid="child">play surface</div>
      </PauseBoundary>,
    )
    expect(screen.getByTestId('child')).toBeInTheDocument()
    expect(screen.queryByRole('status')).not.toBeInTheDocument()
  })

  it('hides children and renders the overlay when paused=true (presence)', () => {
    render(
      <PauseBoundary pause={pauseOf({ paused: true })} players={[BEA]} actions={actionsOf()}>
        <div data-testid="child">play surface</div>
      </PauseBoundary>,
    )
    expect(screen.queryByTestId('child')).not.toBeInTheDocument()
    expect(screen.getByRole('status')).toBeInTheDocument()
  })

  it('remounts children when paused toggles true→false (i.e., children unmount, not visibility:hidden)', () => {
    const onMount = vi.fn()
    const { rerender } = render(
      <PauseBoundary pause={pauseOf({ paused: false })} players={[]} actions={actionsOf()}>
        <MountCounterChild onMount={onMount} />
      </PauseBoundary>,
    )
    expect(onMount).toHaveBeenCalledTimes(1)

    // Pause: child unmounts. Mount count stays at 1.
    rerender(
      <PauseBoundary pause={pauseOf({ paused: true })} players={[BEA]} actions={actionsOf()}>
        <MountCounterChild onMount={onMount} />
      </PauseBoundary>,
    )
    expect(screen.queryByTestId('child')).not.toBeInTheDocument()
    expect(onMount).toHaveBeenCalledTimes(1)

    // Resume: child remounts. Mount count increments — the proof that
    // the previous unmount actually happened.
    rerender(
      <PauseBoundary pause={pauseOf({ paused: false })} players={[]} actions={actionsOf()}>
        <MountCounterChild onMount={onMount} />
      </PauseBoundary>,
    )
    expect(screen.getByTestId('child')).toBeInTheDocument()
    expect(onMount).toHaveBeenCalledTimes(2)
  })

  it('shows the missing peer name in the presence-pause text', () => {
    render(
      <PauseBoundary pause={pauseOf({ paused: true })} players={[BEA]} actions={actionsOf()}>
        <div>play</div>
      </PauseBoundary>,
    )
    expect(
      screen.getByText(/Waiting for/),
    ).toBeInTheDocument()
    expect(screen.getByText('bea')).toBeInTheDocument()
  })

  it('renders the manual-pause text + Resume button when manuallyPausedBy is set', async () => {
    const user = userEvent.setup()
    const onResume = vi.fn()
    render(
      <PauseBoundary
        pause={pauseOf({ manuallyPausedBy: ADA, sendManualUnpause: onResume })}
        players={[]}
        actions={actionsOf()}
      >
        <div>play</div>
      </PauseBoundary>,
    )
    expect(screen.getByText(/paused the game/)).toBeInTheDocument()
    const resume = screen.getByRole('button', { name: 'Resume' })
    await user.click(resume)
    expect(onResume).toHaveBeenCalledTimes(1)
  })

  // The escape from a wedged presence-pause. It is an action rather than a
  // callback because the overlay REPLACES the play area — the game's own
  // `act-stop-game` goes off the action stack with it — so `GamePage`, which is
  // above this boundary, binds a second one and hides it unless paused.
  it('places Stop game on the overlay, and fires the action it was given', async () => {
    const user = userEvent.setup()
    const actStopGame = ZTest_actionFixture('act-stop-game')
    render(
      <PauseBoundary pause={pauseOf()} players={[BEA]} actions={actionsOf({ actStopGame })}>
        <div>play</div>
      </PauseBoundary>,
    )
    await user.click(screen.getByRole('button', { name: 'Stop game' }))
    expect(actStopGame.run).toHaveBeenCalledTimes(1)
  })

  it('draws nothing for an action that says it is hidden', () => {
    render(
      <PauseBoundary
        pause={pauseOf()}
        players={[BEA]}
        actions={actionsOf({
          actStopGame: ZTest_actionFixture('act-stop-game', () => ({ state: 'hidden' })),
        })}
      >
        <div>play</div>
      </PauseBoundary>,
    )
    expect(screen.queryByRole('button', { name: 'Stop game' })).not.toBeInTheDocument()
  })
})
