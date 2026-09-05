// cs-blessed-deep

/**
 * `HH:MM:SS.mmm` wall-clock stamp — **the one format all three console
 * diagnostic channels share**, so a screenshot of a friend's console
 * interleaves their trails cleanly:
 *
 *     [db …]   dbLog.ts                 — every database call
 *     [rt …]   realtimeDiag.ts          — channel lifecycle and events
 *     [ui …]   PlayAreaMountLog.tsx     — the play surface's mount breadcrumbs
 *
 * This is the one place the three are listed. (`[rpc]` is the edge runtime's
 * line, written in Deno on its own clock, so it is not a fourth here.)
 */
export function logStamp(): string {
  const t = new Date()
  const hh = String(t.getHours()).padStart(2, '0')
  const mm = String(t.getMinutes()).padStart(2, '0')
  const ss = String(t.getSeconds()).padStart(2, '0')
  const ms = String(t.getMilliseconds()).padStart(3, '0')
  return `${hh}:${mm}:${ss}.${ms}`
}
