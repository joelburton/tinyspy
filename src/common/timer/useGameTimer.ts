// cs-blessed-timer

import { useEffect, useState } from 'react'
import { db as commonDb } from '../supabase/db'
import { readRows, runRpc } from '../supabase/dbResult'
import { isEnvironmental, reportUnhandled } from '../supabase/dbEnvelope'
import { showFaultModal } from '../faults/faultStore'
import type { TimerMode } from '../manifest/gameManifest'

/** What `common.tick_timer` puts in `data`. Nullable because its other `ok` —
 *  PA004, the game is gone — arrives through a raise, and
 *  `common.raised_envelope` builds `data: null`. */
type Ticked = { result: 'ticked'; ticks: number } | null

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

/**
 * The game clock: the number to show, and whether a countdown has run out.
 *
 * While the game is running, unpaused and timed, this calls `common.tick_timer`
 * once a second — one round-trip that both advances the shared count and
 * returns it. A second nobody ticks is a second that does not count, which is
 * the whole of pause and idle; `doc.md` has the model.
 *
 *  - `displaySeconds` — countup: the count; countdown: `max(0, seconds - count)`;
 *    none: always 0.
 *  - `expired` — a LEVEL, not an edge: true for as long as a countdown sits at
 *    0, false for countup and none. The hook fires nothing. The timeout-loss
 *    RPC is `GamePage`'s `fireTimeoutOnExpiry`, on the rising edge.
 */
export function useGameTimer({
  gameId,
  mode,
  paused,
  running,
}: {
  gameId: string
  mode: TimerMode
  paused: boolean
  // The game is live (loaded + not terminal). The driver only runs while true —
  // a terminal game freezes the clock at its final value, and a still-loading
  // game doesn't tick yet.
  running: boolean
}): { displaySeconds: number; expired: boolean } {
  const [ticks, setTicks] = useState(0)

  // Initial read, so a (re)mount or late-join shows the right value
  // immediately rather than flashing 0 before the driver's first
  // round-trip lands.
  useEffect(function seedFromTimersRow() {
    let canceled = false
    // `presentFaults: false` for the same reason the driver opts out, and the
    // two must agree: a seed read and a tick fail together — same network, same
    // second — so showing this one while the driver silently swallows its twin
    // would put a modal on the mount and nothing on the next forty attempts.
    //
    // No `.maybeSingle()`: `readRows` hands back rows, and `game_id` is the PK,
    // so this is 0 or 1 of them.
    void readRows(commonDb.from('timers').select('ticks').eq('game_id', gameId), {
      presentFaults: false,
    }).then(function applySeedAnswer(res) {
      if (canceled) return
      if (res.type === 'not-ok' && isEnvironmental(res.dbcode)) {
        // Nothing reached us. The driver's first tick supplies the count a
        // second later, so there is nothing to recover and nothing to say.
      } else if (res.type === 'not-ok') {
        // A real fault, and the seed read is the only thing that would report
        // it — the driver's chain treats a bad `timers` table the same way.
        showFaultModal({ text: res.message })
      } else if (res.type === 'ok') {
        // ZERO ROWS is an untimed game, or one whose row is not written yet.
        // Leave the display at 0; the driver is the authority either way.
        const row = res.data[0]
        if (row) setTicks((t) => mergeTicks(t, row.ticks))
      }
    })
    return () => {
      canceled = true
    }
  }, [gameId])

  // Driver: while the game is live, not paused, and timed, ask the
  // server to advance the shared clock once a second and read back
  // the authoritative count. Stopping (pause / terminal / untimed)
  // is the whole pause+idle mechanism — no ticks accrue.
  useEffect(function driveTheClock() {
    if (!running || paused || mode.kind === 'none') return
    let canceled = false
    const drive = () => {
      // `presentFaults: false`: this call decides per answer, and the branches
      // below are that decision. A poll fires once a second, so a failure that
      // persists would otherwise be a modal a second.
      void runRpc<Ticked>(commonDb.rpc('tick_timer', { target_game: gameId }), {
        presentFaults: false,
      }).then(function applyTickAnswer(res) {
        if (canceled) return
        if (res.type === 'not-ok' && isEnvironmental(res.dbcode)) {
          // Our server did not answer. Silent: the clock only advances because
          // a viewer asks it to, so a tick that did not happen is what it does
          // anyway when nobody is watching. Nothing is lost — the next call
          // that lands returns the authoritative count.
        } else if (res.type === 'not-ok' && (res.dbcode === 'PN011' || res.dbcode === 'PN012')) {
          // Signed out, or no longer in this club. Worth telling them, even
          // once a second, because the auth machinery is unmounting this page
          // underneath it and the count is about to stop meaning anything.
          showFaultModal({ text: res.message })
        } else if (res.type === 'ok' && res.dbcode === 'PA004') {
          // The game was deleted under us: no clock to advance. The page is
          // about to become a no-such-game on its own.
        } else if (res.type === 'ok' && res.data !== null && res.data.result === 'ticked') {
          const { ticks } = res.data
          setTicks((t) => mergeTicks(t, ticks))
        } else {
          // A bug: an answer this chain cannot read. Once a second is the right
          // volume for it — loud enough to meet in a game or an e2e run.
          reportUnhandled('tick_timer', res)
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
