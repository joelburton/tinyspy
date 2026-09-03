// cs-met-deep

/**
 * `HH:MM:SS.mmm` wall-clock stamp — **the one format all three console
 * diagnostic channels share**, so a screenshot of a friend's console
 * interleaves their trails cleanly:
 *
 *     [db …]   dbLog.ts                 — every database call
 *     [rt …]   realtimeDiag.ts          — channel lifecycle and events
 *     [ui …]   PlayAreaMountLog.tsx     — the play surface's mount breadcrumbs
 *
 * It lives here rather than with any of them because it belongs to none: it
 * used to sit in `realtimeDiag`, which meant the database log imported its
 * timestamp from the realtime diagnostics.
 */
export function logStamp(): string {
  const t = new Date()
  const hh = String(t.getHours()).padStart(2, '0')
  const mm = String(t.getMinutes()).padStart(2, '0')
  const ss = String(t.getSeconds()).padStart(2, '0')
  const ms = String(t.getMilliseconds()).padStart(3, '0')
  return `${hh}:${mm}:${ss}.${ms}`
}
