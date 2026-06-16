import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useSyncExternalStore,
} from 'react'
import type { TimerMode } from '../lib/games'

/**
 * Per-game timer hook. Returns a display-ready elapsed/remaining
 * value and an `expired` flag for countdown mode.
 *
 * **Browser-side, not server-synced.** The hook anchors at the
 * game's `startedAt` (a server-stamped ISO timestamp, almost
 * always `games.created_at`), then ticks locally using
 * `Date.now()`. There's no heartbeat back to the server. See
 * docs/wordknit.md → "Timer" for the full rationale; short
 * version: friends-coop doesn't need sub-second accuracy, our
 * past experience with heartbeat-synced timers was uneven
 * seconds (visible "fast/slow" hiccups at sync boundaries),
 * and the drift across browsers in our case is bounded to a
 * few hundred ms over a typical game — invisible at our scale.
 *
 * **Pause handling.** Observes the `paused` flag. While paused,
 * the displayed value freezes. The hook accumulates pause
 * durations in a ref so the resumed display continues from
 * where it left off rather than jumping. The pause-window
 * timestamps are each client's local `Date.now()` at the
 * moment they observe pause/resume — so there's a per-pause
 * drift of roughly the one-way broadcast latency between
 * clients (typically 30-100ms for same-region Supabase). For
 * our use case this drift is invisible; if a future game needs
 * tighter sync, the principled fix is to include the pauser's
 * timestamp in the broadcast payload and use *that* as each
 * receiver's pause-start — see git history of the discussion.
 *
 * **Background tabs / sleep.** Display always recomputes from
 * `Date.now()` rather than incrementing a counter, so when a
 * backgrounded tab returns (or a laptop wakes from sleep), the
 * timer catches up to "real" elapsed time on the next tick.
 * No drift accumulates from suspended timers.
 *
 * **Why useSyncExternalStore.** The natural shape for a timer
 * hook is "compute displayed value from Date.now() on every
 * render" — but React's stricter hook rules now flag Date.now()
 * and ref reads during render as suspect (they suggest your
 * component will misbehave under concurrent rendering). The
 * useSyncExternalStore primitive exists exactly for this case:
 * "this hook is observing an external mutable source." Subscribe
 * installs the 1Hz tick; getSnapshot computes the current value
 * from the time source and the hook's internal refs. React then
 * guarantees the subscription's notify() correctly drives
 * re-renders, and the snapshot read is treated as legitimately
 * stateful (the rule allows it).
 *
 * Returns:
 *   - `displaySeconds` — for `mode.kind === 'countup'`, the
 *     elapsed seconds since startedAt minus accumulated pause.
 *     For `'countdown'`, max(0, seconds - elapsed). For
 *     `'none'`, always 0.
 *   - `expired` — true once a countdown reaches 0. Useful for
 *     firing a timeout-loss RPC. Always false for countup/none.
 */
export function useGameTimer({
  startedAt,
  paused,
  mode,
  idleSeconds,
}: {
  startedAt: string
  paused: boolean
  mode: TimerMode
  /**
   * Server-tracked accumulator of "wall-clock time during which
   * no one was viewing this game." Subtracted from the elapsed
   * computation so a 10-minute countdown that sat unseen for
   * 5 minutes still reads 9:50, not 4:50. Updated by
   * common.set_current_view (which folds the last idle window)
   * and refreshed via the postgres-changes subscription on
   * common.games.
   *
   * Defaults to 0 when omitted — lets callers that don't yet
   * track idle (or solo games where no idle window can
   * accumulate, since the single player is also the only viewer)
   * use the hook without threading 0 explicitly.
   */
  idleSeconds?: number
}): { displaySeconds: number; expired: boolean } {
  // Anchor: parse the ISO timestamp once per startedAt change.
  // (Almost always once per hook lifetime — created_at doesn't
  // change after the game is inserted.)
  const startedAtMs = useMemo(
    () => new Date(startedAt).getTime(),
    [startedAt],
  )

  // Accumulated total pause duration (ms). Doesn't include the
  // currently-open pause window — that's added at compute-time
  // so the display freezes smoothly while paused.
  const accumulatedPauseMsRef = useRef(0)
  // Timestamp when the current pause started, or null when not
  // paused. Captured at the moment we observe `paused` flip
  // true; closed (and added to accumulatedPauseMs) when paused
  // flips false.
  const pauseStartedAtRef = useRef<number | null>(null)

  // Track pause transitions. The effect handles state-management;
  // the snapshot below reads the resulting refs to compute the
  // displayed value.
  useEffect(() => {
    if (paused && pauseStartedAtRef.current === null) {
      pauseStartedAtRef.current = Date.now()
    } else if (!paused && pauseStartedAtRef.current !== null) {
      accumulatedPauseMsRef.current += Date.now() - pauseStartedAtRef.current
      pauseStartedAtRef.current = null
    }
  }, [paused])

  // useSyncExternalStore subscribe: install a 1Hz tick when
  // applicable (not paused, not "none" mode). Notify is React's
  // way of telling us "re-read the snapshot and re-render if
  // it changed." We just call it once per second.
  const subscribe = useCallback(
    (notify: () => void) => {
      if (paused || mode.kind === 'none') return () => {}
      const id = setInterval(notify, 1000)
      return () => clearInterval(id)
    },
    [paused, mode.kind],
  )

  // Compute the current displayed value. Called by React after
  // subscribe's notify() fires, and on initial render.
  //
  // Reading refs + Date.now() inside this callback is the
  // sanctioned shape for useSyncExternalStore — the function
  // describes the current state of an external source.
  const getSnapshot = useCallback((): number => {
    if (mode.kind === 'none') return 0
    const now = Date.now()
    const currentPauseMs =
      pauseStartedAtRef.current !== null
        ? now - pauseStartedAtRef.current
        : 0
    const elapsedMs = Math.max(
      0,
      now -
        startedAtMs -
        accumulatedPauseMsRef.current -
        currentPauseMs -
        (idleSeconds ?? 0) * 1000,
    )
    const elapsedSeconds = Math.floor(elapsedMs / 1000)
    if (mode.kind === 'countup') return elapsedSeconds
    return Math.max(0, mode.seconds - elapsedSeconds)
  }, [mode, startedAtMs, idleSeconds])

  const displaySeconds = useSyncExternalStore(subscribe, getSnapshot)
  const expired = mode.kind === 'countdown' && displaySeconds === 0

  return { displaySeconds, expired }
}

/**
 * Format seconds as "M:SS" — the common timer display in the
 * BoardScreen header. Used by both countup and countdown modes.
 */
export function formatTimerSeconds(seconds: number): string {
  const m = Math.floor(seconds / 60)
  const s = seconds % 60
  return `${m}:${s.toString().padStart(2, '0')}`
}
