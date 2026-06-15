import { useEffect, useRef, type ReactNode } from 'react'
import { cls } from '../lib/cls'
import type { SetupMember } from '../lib/games'
import { PauseOverlay } from './PauseOverlay'
import styles from './PauseBoundary.module.css'

type Props = {
  /** Whether the game is currently paused. Union of all pause
   *  sources (presence-disconnect today; manual-pause in the
   *  future). The boundary doesn't care about source — only
   *  about the boolean. */
  paused: boolean
  /** Members currently expected but absent — populated when the
   *  pause is caused by someone being disconnected. Passed
   *  through to PauseOverlay for the "Waiting for Bea…" copy. */
  missing: SetupMember[]
  /**
   * The member who clicked the manual Pause button, if the pause
   * has a manual source. Inert in today's wordknit usage (no
   * Pause button yet); shaped here so the manual-pause feature
   * can land without an API change at call sites. PauseOverlay
   * branches its copy on whether this is set.
   */
  manuallyPausedBy?: SetupMember | null
  /**
   * Edge-triggered callback fired ONCE on the transition from
   * not-paused → paused. The hosting game uses this to clear
   * transient client state that shouldn't survive a pause
   * (wordknit uses it to broadcast a `clear` to drop everyone's
   * selection). Called regardless of pause source.
   */
  onPause?: () => void
  /**
   * Resume handler for the manual-pause case. Inert in today's
   * usage (no Pause button → no Resume button). When the feature
   * lands, this is wired to the overlay's Resume button. Any
   * connected player can call it — there's no privileged
   * "original pauser" check.
   */
  onResume?: () => void
  /**
   * Optional class for the wrapper div, so the host can apply
   * its own game-specific surface styling (background, border,
   * padding, etc.). The boundary's own CSS contributes only
   * `position: relative` — required so the overlay can absolute-
   * position itself to fill the boundary.
   */
  className?: string
  children: ReactNode
}

/**
 * Common wrapper that renders either the play surface or a
 * `PauseOverlay`, based on a single `paused` flag. Acts as the
 * Error-Boundary-style "catches a state, renders fallback or
 * children" abstraction for the pause-on-disconnect + future
 * manual-pause patterns.
 *
 * **Paused state semantics:**
 * - **paused === false**: children render visibly and
 *   interactively; the overlay doesn't render at all.
 * - **paused === true**: children render but are hidden via
 *   CSS `visibility: hidden` — they hold their layout (so the
 *   boundary keeps its size) and are non-interactive (clicks
 *   don't land). The overlay renders on top.
 *
 * The `visibility: hidden` trick is deliberate: it preserves
 * the children's intrinsic size (avoiding a "boundary collapses
 * to padding" layout glitch when the overlay needs dimensions
 * to fill) without requiring callers to specify min-heights.
 * Children's effects keep running while hidden — that's fine
 * for us because the heavy work (realtime subscriptions) lives
 * in the host's useGame hook above this boundary, not inside
 * the children's render tree.
 *
 * **Why not `display: none`** for the children when paused?
 * Same reason: it removes them from layout, collapsing the
 * boundary's size. The overlay then has nothing to fill.
 *
 * **Why not unmount children** when paused? React doesn't have
 * a built-in "keep mounted but inert" mode, and unmounting
 * would lose any local UI state (transient banners, button
 * focus, etc.) on every pause/unpause cycle.
 *
 * The `onPause` edge-trigger fires once per pause-transition,
 * not on every render while paused. The hosting game uses it to
 * clear transient state that shouldn't survive a pause —
 * wordknit broadcasts a `selection clear` so reconnecting peers
 * land in an empty-selection state.
 *
 * Future manual-pause work activates the inert `onResume` and
 * `manuallyPausedBy` fields without changing call sites. See
 * `docs/wordknit.md` → "Pause on disconnect" + future "Manual
 * pause" sections.
 */
export function PauseBoundary({
  paused,
  missing,
  manuallyPausedBy,
  onPause,
  onResume,
  className,
  children,
}: Props) {
  // Edge-trigger onPause on transition false → true. The ref
  // resets to false on the reverse transition, so a future
  // unpause + repause fires the callback again.
  const wasPausedRef = useRef(false)
  useEffect(() => {
    if (paused && !wasPausedRef.current) {
      wasPausedRef.current = true
      onPause?.()
    } else if (!paused) {
      wasPausedRef.current = false
    }
  }, [paused, onPause])

  return (
    <div className={cls(styles.boundary, className)}>
      <div className={cls(paused && styles.hidden)}>{children}</div>
      {paused && (
        <PauseOverlay
          missing={missing}
          manuallyPausedBy={manuallyPausedBy}
          onResume={onResume}
        />
      )}
    </div>
  )
}
