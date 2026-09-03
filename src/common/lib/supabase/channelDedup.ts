// cs-fixed-deep

// Bumped per fallback call, so two suffixes minted in the same
// millisecond still differ.
let counter = 0

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
export function channelDedupSuffix(): string {
  // Prefer the platform UUID — but it is not always there. Web
  // Crypto restricts `randomUUID` to SECURE CONTEXTS (HTTPS, or
  // localhost / 127.0.0.1), so hitting the dev server at a LAN
  // IP like `http://10.0.0.89:5173` leaves it undefined and
  // calling it throws `not a function`. Same on `file://`,
  // older browsers, some embedded WebViews.
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
