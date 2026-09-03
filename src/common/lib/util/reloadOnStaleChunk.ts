// cs-blessed-deep

import { readStored, writeStored } from './storage'

/**
 * Reload the page when a code-split chunk fails to load — stale-deploy recovery.
 *
 * Every game's PlayArea / SetupForm / Help ships in a lazily-imported chunk
 * named by content hash (the sibling-manifest + code-splitting pattern,
 * docs/common.md). Netlify deploys are atomic: publishing a new build deletes
 * the previous build's hashed assets. So a tab opened before a deploy that
 * lazy-loads its first game *after* it asks for a chunk that no longer exists —
 * the import rejects, nothing catches it, and React unmounts to a blank page.
 *
 * Vite's build wraps every dynamic import in a preload helper that dispatches
 * `vite:preloadError` on window when the chunk (or one of its CSS/JS deps)
 * fails to load. One reload fetches the current index.html, whose asset
 * references match what's actually deployed — the same recovery a manual
 * refresh performs, minus the person having to know that.
 *
 * The sessionStorage guard caps this at one reload per minute per tab: when
 * chunks are failing for a real reason (an outage, not a stale deploy), the
 * second failure is allowed to throw — landing in PlayAreaErrorBoundary's
 * card rather than spinning a reload loop. A browser that blocks site data
 * gets no recovery at all rather than an uncounted one; see `reloadedRecently`.
 */

const GUARD_KEY = 'puzpuzpuz:staleChunk:reloadedAt'
const GUARD_MS = 60_000

/**
 * Has this tab already reloaded for a failed chunk in the last minute?
 *
 * **Fails closed.** Where a browser blocks site data `sessionStorage` throws,
 * and a counter that cannot count has to answer one way or the other: "yes,
 * recently" gives up stale-deploy recovery, and the cost of that is a manual
 * refresh — what people did before this existed. "No" would reload every time
 * a chunk failed, which is the loop the counter exists to prevent.
 */
function reloadedRecently(): boolean {
  // The fail-closed half, spelled as the stand-in VALUE rather than a second
  // branch: no storage stands in "reloaded just now", so this answers yes and
  // the reload is skipped. An ABSENT key is a different answer — `'0'`, i.e.
  // long ago — and the two must not collapse, which is why `whenUnavailable`
  // exists and has no default.
  const at = readStored('session', GUARD_KEY, String(Date.now()))
  return Date.now() - Number(at ?? '0') < GUARD_MS
}

function rememberReload(): void {
  // Reads can succeed where a write fails (a full quota); `writeStored`
  // swallowing that is what keeps a throw here from skipping the
  // preventDefault below, which would leave the page neither reloaded nor
  // showing the error it swallowed.
  writeStored('session', GUARD_KEY, String(Date.now()))
}

export function reloadOnStaleChunk() {
  window.addEventListener('vite:preloadError', (event) => {
    if (reloadedRecently()) return // let it throw
    rememberReload()
    event.preventDefault() // swallow the import error; the reload supersedes it
    window.location.reload()
  })
}
