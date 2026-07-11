import { useEffect, useState } from 'react'
import { db as commonDb } from '../../db'
import type { TimerMode } from '../../lib/games'

/**
 * Per-game timer hook. Returns a display-ready elapsed/remaining
 * value and an `expired` flag for countdown mode.
 *
 * **Additive tick model (server-authoritative count).** The clock is
 * a single integer — `common.timers.ticks`, the number of whole
 * seconds of *active play*. Every actively-playing client calls
 * `common.tick_timer` once a second; the server advances the shared
 * count by at most 1 per real second (its conditional dedupes across
 * players — see the RPC). This hook just reflects that count:
 * countdown shows `max(0, seconds - ticks)`, countup shows `ticks`.
 *
 * **Pause and idle need no bookkeeping.** When the game is paused, or
 * the game isn't running (terminal / still loading), we simply stop
 * calling `tick_timer` — so the count stops. There is no wall-clock
 * subtraction, no pause-duration accumulator, no idle accumulator:
 * a second with no tick is, by construction, a second that didn't
 * count. (This replaced the old `now - startedAt - pause - idle`
 * arithmetic and the `idle_since`/`total_idle_seconds` columns.)
 *
 * **Why the server clock is the authority.** `tick_timer` gates on
 * the database's `now()`, so a client's wall-clock skew or a
 * throttled background-tab `setInterval` can only *trigger* the
 * attempt — it can't move the count. Accuracy is ±~1s around a
 * pause, which is fine for friendly word games.
 *
 * The same `tick_timer` call that advances the clock returns the
 * current value, so driving and reading are one round-trip. Locally
 * `ticks` merges forward-only against small backward values (an
 * out-of-order response can't rewind the display) — but a LARGE
 * backward jump is accepted: that's not reordering, it's
 * `common.reset_game` zeroing the shared clock (replay-board), and
 * the display must follow it back to a fresh countdown/countup.
 *
 * Returns:
 *   - `displaySeconds` — countup: `ticks`; countdown:
 *     `max(0, seconds - ticks)`; none: always 0.
 *   - `expired` — true once a countdown reaches 0 (fires the
 *     timeout-loss RPC). Always false for countup / none.
 */
/** Merge a server-reported tick count into local state. Concurrent players'
 *  in-flight responses can land out of order, differing by a tick or two —
 *  those stay forward-only (`Math.max`). A drop bigger than that isn't
 *  reordering: it's the server clock being RESET (`common.reset_game` on
 *  replay-board), and the display follows it down. (If a stale high response
 *  lands right after a reset, the next 1s round-trip re-detects the drop —
 *  self-healing.) */
function mergeTicks(prev: number, server: number): number {
  return server < prev - 2 ? server : Math.max(prev, server)
}

export function useGameTimer({
  gameId,
  mode,
  paused,
  running,
}: {
  gameId: string
  mode: TimerMode
  paused: boolean
  /** The game is live (loaded + not terminal). The driver only runs
   *  while true — a terminal game freezes the clock at its final
   *  value, and a still-loading game doesn't tick yet. */
  running: boolean
}): { displaySeconds: number; expired: boolean } {
  const [ticks, setTicks] = useState(0)

  // Initial read, so a (re)mount or late-join shows the right value
  // immediately rather than flashing 0 before the driver's first
  // round-trip lands.
  useEffect(() => {
    let cancelled = false
    void commonDb
      .from('timers')
      .select('ticks')
      .eq('game_id', gameId)
      .maybeSingle()
      .then(({ data }) => {
        if (!cancelled && data) setTicks((t) => mergeTicks(t, data.ticks))
      })
    return () => {
      cancelled = true
    }
  }, [gameId])

  // Driver: while the game is live, not paused, and timed, ask the
  // server to advance the shared clock once a second and read back
  // the authoritative count. Stopping (pause / terminal / untimed)
  // is the whole pause+idle mechanism — no ticks accrue.
  useEffect(() => {
    if (!running || paused || mode.kind === 'none') return
    let cancelled = false
    const drive = () => {
      void commonDb
        .rpc('tick_timer', { target_game: gameId })
        .then(({ data, error }) => {
          if (cancelled || error || typeof data !== 'number') return
          setTicks((t) => mergeTicks(t, data))
        })
    }
    drive() // immediately, then once a second
    const id = setInterval(drive, 1000)
    return () => {
      cancelled = true
      clearInterval(id)
    }
  }, [gameId, mode.kind, paused, running])

  const displaySeconds =
    mode.kind === 'none'
      ? 0
      : mode.kind === 'countup'
        ? ticks
        : Math.max(0, mode.seconds - ticks)
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
