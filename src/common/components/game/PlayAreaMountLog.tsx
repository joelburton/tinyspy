import { useEffect, useRef, type ReactNode } from 'react'
import { logStamp } from '../../lib/supabase/realtimeDiag'

/**
 * Console breadcrumbs for the play surface's LIFECYCLE — the diagnosis
 * trail for "the play area is blank" reports from real browsers, where the
 * setup can't be inspected directly and the console has to tell the story.
 *
 * Deliberately **mount/unmount only** — the play surface re-renders
 * constantly (every keystroke, timer tick, presence sync, realtime
 * refetch), so a per-render log would drown the console and bury the
 * `[rt]` trail it's meant to sit beside. Mounts are rare events: page
 * load, pause/resume (PauseBoundary unmounts the surface), navigation.
 *
 * Two components because "the shell decided to show the surface" and "the
 * game's code actually committed" are different facts with different
 * failure modes, and App.tsx has a distinct place for each:
 *
 *   - `PlayAreaSlotLog` wraps the whole render-prop child (boundary +
 *     Suspense + game). Its mount means GamePage is past loading/pause
 *     and handed the surface its slot.
 *   - `PlayAreaReadyLog` sits INSIDE the Suspense boundary as a sibling
 *     of the lazy game component, so it commits only when the game's
 *     code-split chunk has loaded and the game rendered alongside it.
 *
 * Reading the trail when someone reports a blank play area:
 *   - **no "slot mounted" line** → the shell never rendered the surface
 *     (still loading, paused, game row missing). GamePage shows its own
 *     cards for all of those, so a truly blank screen here points at the
 *     shell, not the game.
 *   - **"slot mounted" but no "rendered"** → the game chunk never
 *     committed: stuck on the Suspense fallback ("Loading game…") or the
 *     import failed. Both designed exits for that (reloadOnStaleChunk in
 *     main.tsx, the PlayAreaErrorBoundary card) are visible, not blank —
 *     so this pair IS the smoking gun for a new failure mode.
 *   - **both lines, then blank** → the game component itself rendered
 *     empty; the gametype + play_state in the slot line say exactly which
 *     game and state to reproduce against.
 *
 * The slot-mount log is followed by a one-line **browser snapshot**
 * (viewport, DPR, screen, an approximate zoom, root font size, pointer, UA) so
 * a filtered-to-`[ui]` copy-paste carries the environment along with the
 * lifecycle. It re-logs on every remount on purpose — zoom and window
 * size can change mid-session, and a pause/resume captures the new state.
 */

/** One-line environment snapshot for the mount log. All raw measurements
 *  plus two derived hints, each with a known caveat:
 *    - `zoom` ≈ outerWidth/innerWidth is the classic desktop heuristic,
 *      but DOCKED DEVTOOLS shrink innerWidth and skew it high — and the
 *      reporter will usually have devtools open to copy the log. Treat it
 *      as a hint; dpr + root font are the trustworthy zoom signals
 *      (browser zoom scales dpr on Chrome/Firefox, and a user-enlarged
 *      font changes rem — which the app's 56.25rem breakpoint runs on).
 *    - `pinch` (visualViewport.scale) only appears when ≠ 1.
 *    - `pointer` is the PRIMARY pointer, with every pointer the device has in
 *      brackets — `coarse (any: coarse+fine)` is a touchscreen laptop, where
 *      the touch panel answers first but a trackpad is right there. That
 *      distinction decides a real gate: bananagrams blocks on `pointer: coarse`
 *      alone, so a laptop reporting coarse gets the desktop-only screen while
 *      holding a mouse. Reading it out of a log beats guessing from a UA
 *      string, which says nothing about pointers at all. */
function browserInfoLine(): string {
  const zoom =
    window.outerWidth > 0 && window.innerWidth > 0
      ? `${Math.round((window.outerWidth / window.innerWidth) * 100)}%`
      : '?'
  const pinch = window.visualViewport?.scale
  // `matchMedia` is universally supported in the browsers this app targets;
  // the `?.` guards a non-DOM test environment rather than an old browser.
  const mq = (q: string) => window.matchMedia?.(q).matches ?? false
  const primaryPointer = mq('(pointer: coarse)')
    ? 'coarse'
    : mq('(pointer: fine)')
      ? 'fine'
      : 'none'
  const anyPointer =
    [mq('(any-pointer: fine)') && 'fine', mq('(any-pointer: coarse)') && 'coarse']
      .filter(Boolean)
      .join('+') || 'none'
  return (
    `viewport ${window.innerWidth}×${window.innerHeight}` +
    ` | dpr ${window.devicePixelRatio}` +
    ` | screen ${screen.width}×${screen.height}` +
    ` | zoom ~${zoom}` +
    ` | root font ${getComputedStyle(document.documentElement).fontSize}` +
    ` | pointer ${primaryPointer} (any: ${anyPointer})` +
    (pinch != null && pinch !== 1 ? ` | pinch ${pinch}` : '') +
    ` | ${navigator.userAgent}`
  )
}

/** Wraps the play-surface slot; logs when GamePage mounts/unmounts it. */
export function PlayAreaSlotLog({
  gametype,
  gameId,
  playState,
  isTerminal,
  children,
}: {
  gametype: string
  gameId: string
  playState: string
  isTerminal: boolean
  children: ReactNode
}) {
  // Snapshot the at-mount state once (a ref initializer runs on the first
  // render only) — the log is a mount event, and putting the live values in
  // the effect's deps would re-fire it on every play_state change, exactly
  // the flood this component exists to avoid.
  const atMountRef = useRef({ playState, isTerminal })
  useEffect(() => {
    const atMount = atMountRef.current
    console.log(
      `[ui ${logStamp()}] playarea slot mounted — ${gametype} ${gameId} ` +
        `(play_state=${atMount.playState} terminal=${atMount.isTerminal})`,
    )
    console.log(`[ui ${logStamp()}] browser — ${browserInfoLine()}`)
    return () => {
      console.log(`[ui ${logStamp()}] playarea slot unmounted — ${gametype} ${gameId}`)
    }
  }, [gametype, gameId])
  return children
}

/** Suspense sibling of the lazy game component; commits — and logs — only
 *  once the game's chunk has loaded and rendered. Renders nothing. */
export function PlayAreaReadyLog({ gametype }: { gametype: string }) {
  useEffect(() => {
    console.log(`[ui ${logStamp()}] playarea rendered — ${gametype} (chunk loaded + committed)`)
  }, [gametype])
  return null
}
