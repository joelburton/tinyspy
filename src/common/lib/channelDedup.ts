/**
 * Generate a unique-enough suffix for a supabase-js Realtime
 * channel name — and ONLY for that purpose.
 *
 * The use case is narrow and specific: supabase-js caches
 * channels by name. In React StrictMode (and on legitimate
 * remount) the same channel name on a second mount returns the
 * already-subscribed cached instance, so a `.on(...)` call
 * after `.subscribe(...)` throws. Appending a per-effect-run
 * suffix makes each channel name unique, sidestepping the
 * cache. See `useGame.ts` files for the canonical example.
 *
 * Prefers `crypto.randomUUID()` when available — but it isn't
 * always: the Web Crypto API restricts `randomUUID` to
 * **secure contexts** (HTTPS or `localhost` / `127.0.0.1`).
 * Hitting the dev server at a LAN IP like `http://10.0.0.89:5173`
 * is NOT a secure context, so `crypto.randomUUID` is undefined
 * and calling it throws `not a function`. Same on `file://`
 * pages, older browsers, some embedded WebViews. The fallback
 * is `Date.now()` + a process-local counter + Math.random
 * words — unique enough for channel-name deduplication.
 *
 * **DO NOT** use this for cryptographic randomness (auth
 * nonces, session tokens, CSRF values, anything user-visible
 * that needs to be unpredictable). The function name reflects
 * its narrow scope: if you find yourself wanting to import
 * `channelDedupSuffix` for something other than a Realtime
 * channel name, you want a different primitive. Reach for
 * `crypto.getRandomValues(new Uint8Array(...))` directly and
 * surface a clear error when the secure context isn't
 * available.
 */
let counter = 0

export function channelDedupSuffix(): string {
  // Prefer the platform UUID when available (secure-context dev
  // on localhost; HTTPS in production).
  if (
    typeof crypto !== 'undefined' &&
    typeof crypto.randomUUID === 'function'
  ) {
    return crypto.randomUUID()
  }
  // Fallback: timestamp (base 36) + counter + a couple of
  // Math.random words. Unique within a session, well enough to
  // dedupe channel names; not cryptographically random and not
  // claimed to be.
  counter += 1
  const t = Date.now().toString(36)
  const c = counter.toString(36)
  const r1 = Math.random().toString(36).slice(2, 10)
  const r2 = Math.random().toString(36).slice(2, 10)
  return `${t}-${c}-${r1}${r2}`
}
