import type { ReactNode } from 'react'
import type { Member } from '../lib/games'
import { PauseOverlay } from './PauseOverlay'

type Props = {
  /** Whether the game is currently paused. Union of all pause
   *  sources (presence-disconnect, manual-pause). The boundary
   *  doesn't care about source — only the boolean. */
  paused: boolean
  /** Members currently expected but absent — populated when the
   *  pause is caused by someone being disconnected. Passed to
   *  PauseOverlay for the "Waiting for Bea…" copy. */
  missing: Member[]
  /** The member who clicked the manual Pause button, if the pause
   *  has a manual source. PauseOverlay branches its copy on this. */
  manuallyPausedBy?: Member | null
  /** Resume handler for the manual-pause case. Any connected
   *  player can call it — no privileged "original pauser" check. */
  onResume?: () => void
  /** The play surface. Rendered only when `paused === false`. */
  children: ReactNode
}

/**
 * Common wrapper that renders either children or a `PauseOverlay`,
 * based on a single `paused` flag.
 *
 * **Paused state semantics — conditional render:**
 * - `paused === false`: children render. The overlay is absent.
 * - `paused === true`: children are NOT rendered (unmount). The
 *   overlay renders standalone.
 *
 * **Why unmount, not visibility:hidden:** the unmount drops
 * children's local state and effects, which is exactly the
 * behavior we want. Per-game PlayArea state — pending inputs,
 * shared selections, transient banners — resets cleanly on
 * resume, no per-game cleanup ceremony needed. Realtime
 * channels in PlayArea's per-gametype `useGame` tear down and
 * reconnect on resume; the brief resubscribe gap is covered by
 * the on-SUBSCRIBED refetch.
 *
 * Cross-cutting state (the common.games row, members, presence,
 * the timer) lives in `useCommonGame` ABOVE this boundary — see
 * `GamePage`. That state is preserved across pause cycles, so the
 * timer keeps a single anchor, presence keeps tracking, and the
 * common channel doesn't churn.
 *
 * The "should this survive a pause?" question gives us a sensible
 * design rule for new game state: persist via DB or via state
 * above the boundary (useCommonGame). State inside PlayArea is
 * always pause-transient.
 *
 * See `docs/games/wordknit.md` → "Pause on disconnect" for the broader
 * pattern.
 */
export function PauseBoundary({
  paused,
  missing,
  manuallyPausedBy,
  onResume,
  children,
}: Props) {
  if (paused) {
    return (
      <PauseOverlay
        missing={missing}
        manuallyPausedBy={manuallyPausedBy}
        onResume={onResume}
      />
    )
  }
  return <>{children}</>
}
