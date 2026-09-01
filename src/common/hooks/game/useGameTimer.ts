// cs-unmet

import { useEffect, useState } from 'react'
import { db as commonDb } from '../../db'
import { runRpc } from '../../lib/supabase/dbResult'
import { isEnvironmental } from '../../lib/supabase/dbEnvelope'
import { showFaultModal } from '../../lib/fault/faultStore'
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
/** What `common.tick_timer` puts in `data`. Nullable because its other `ok` —
 *  PA004, the game is gone — arrives through a raise, and
 *  `common.raised_envelope` builds `data: null`. */
type Ticked = { result: 'ticked'; ticks: number } | null

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
    let canceled = false
    void commonDb
      .from('timers')
      .select('ticks')
      .eq('game_id', gameId)
      .maybeSingle()
      .then(({ data }) => {
        if (!canceled && data) setTicks((t) => mergeTicks(t, data.ticks))
      })
    return () => {
      canceled = true
    }
  }, [gameId])

  // Driver: while the game is live, not paused, and timed, ask the
  // server to advance the shared clock once a second and read back
  // the authoritative count. Stopping (pause / terminal / untimed)
  // is the whole pause+idle mechanism — no ticks accrue.
  useEffect(() => {
    if (!running || paused || mode.kind === 'none') return
    let canceled = false
    const drive = () => {
      void runRpc<Ticked>(commonDb.rpc('tick_timer', { target_game: gameId })).then((res) => {
        if (canceled) return
        // **A failure to REACH us is silent, and that is the design rather
        // than a shortcut.** This is a POLL: nobody pressed anything, and a
        // tick that does not happen is exactly what the clock does when nobody
        // is viewing — a state the mechanism already handles. There is nothing
        // to retry and nothing to recover; the next successful call returns
        // the authoritative count however many were missed.
        //
        // A failure the RPC DECLARED is a different thing and is not silenced:
        // `runRpc` shows it, once a second if it keeps happening.
        //
        // `dbFetch` matches this with its `isPolled` exemption, so an offline
        // player gets `[db]` lines instead of a fault modal per second. The
        // gap that leaves is filed: docs/deferred.md → "A disconnected player
        // is the one person who is not told".
        if (res.type === 'not-ok' && isEnvironmental(res.dbcode)) {
          // OUR SERVER DID NOT ANSWER — one of the four `FE` codes, and not an
          // answer from the RPC at all. Silent for the reason above: a tick
          // that did not happen is what the clock does anyway when nobody is
          // viewing.
          //
          // This used to read `res.dbcode === null`, which was the only branch
          // in the repo that identified an answer by an ABSENCE — and true for
          // every bug the frontend detects as well, since none of them carried
          // a code either. It swallowed those. Now they are `PN307`–`PN310`
          // and fall through to the scream, which is where a bug belongs.
        } else if (res.type === 'not-ok' && (res.dbcode === 'PN011' || res.dbcode === 'PN012')) {
          // NOT silent: both carry `severity: 'fault'`, so `runRpc` has already
          // put a modal up — which is right, and Joel's call (2026-08-31). A
          // signed-out player should be told. All this branch does is decline
          // to ALSO call it a bug, because it is not one: it is the RPC's own
          // declared refusal, and the auth machinery is already unmounting the
          // page underneath it.
        } else if (res.type === 'ok' && res.dbcode === 'PA004') {
          // The game was deleted under us. No clock to advance, and the page is
          // about to become a no-such-game anyway.
        } else if (res.type === 'ok' && res.data !== null && res.data.result === 'ticked') {
          const { ticks } = res.data
          setTicks((t) => mergeTicks(t, ticks))
        } else {
          // Once a second, and that is FINE (Joel, 2026-08-31): an answer this
          // chain cannot read is a bug we want to meet immediately, in a game or
          // in an e2e run. The alternative is what was here before — three
          // early returns and a silent fall-through, which would have swallowed
          // it forever.
          showFaultModal({ text: 'BUG: tick_timer fell through to unhandled' })
        }
      })
    }
    drive() // immediately, then once a second
    const id = setInterval(drive, 1000)
    return () => {
      canceled = true
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
