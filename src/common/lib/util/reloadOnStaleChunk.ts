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
 * card rather than spinning a reload loop.
 */

const GUARD_KEY = 'stale-chunk-reload-at'
const GUARD_MS = 60_000

export function reloadOnStaleChunk() {
  window.addEventListener('vite:preloadError', (event) => {
    const last = Number(sessionStorage.getItem(GUARD_KEY) ?? '0')
    if (Date.now() - last < GUARD_MS) return // recently reloaded — let it throw
    sessionStorage.setItem(GUARD_KEY, String(Date.now()))
    event.preventDefault() // swallow the import error; the reload supersedes it
    window.location.reload()
  })
}
