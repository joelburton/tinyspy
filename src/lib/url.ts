/**
 * URL-hash helpers used by App to mirror the current game's join code
 * to `#game=ABCDEF`. Pulled out of App.tsx so the regex and DOM
 * mutation can be tested without rendering anything.
 */

/**
 * Reads the `#game=<code>` segment of the URL hash, normalizing to
 * upper case (which matches how `generate_join_code` emits codes).
 * Returns null if the hash doesn't contain a game segment.
 */
export function readHashCode(): string | null {
  const m = window.location.hash.match(/^#game=([A-Za-z0-9]+)$/)
  return m ? m[1].toUpperCase() : null
}

/**
 * Writes (or clears) the `#game=…` hash via `replaceState` so the back
 * button doesn't accumulate an entry per game transition. Passing null
 * strips the hash entirely while preserving any path + query string.
 */
export function writeHashCode(code: string | null) {
  const next = code ? `#game=${code}` : window.location.pathname + window.location.search
  window.history.replaceState(null, '', next)
}
