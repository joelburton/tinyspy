/**
 * Generate a unique-enough string suffix for non-crypto purposes
 * (currently: per-effect-run channel names in our supabase-js
 * subscriptions, to dodge the supabase-js channel-name cache in
 * React StrictMode's double-mount).
 *
 * Prefers `crypto.randomUUID()` when available — but it isn't
 * always: the Web Crypto API restricts `randomUUID` to
 * **secure contexts** (HTTPS or `localhost` / `127.0.0.1`).
 * Hitting the dev server at a LAN IP like `http://10.0.0.89:5173`
 * is NOT a secure context, so `crypto.randomUUID` is undefined
 * and calling it throws `not a function`. Same on file:// pages,
 * older browsers, some embedded WebViews.
 *
 * We don't need cryptographic randomness here — just uniqueness
 * within a session, well enough that two cohabiting tabs and
 * the StrictMode double-mount don't collide. So the fallback is
 * `Math.random()` + a process-local counter + timestamp.
 *
 * Note: if a future use case DOES need cryptographically random
 * ids (auth nonces, user-facing tokens), do NOT reach for this
 * helper. Use `crypto.getRandomValues(new Uint8Array(...))`
 * explicitly and surface a clear error when the secure context
 * isn't available.
 */
let counter = 0

export function randomId(): string {
  // Prefer the platform UUID when available (secure-context dev
  // on localhost; HTTPS in production).
  if (
    typeof crypto !== 'undefined' &&
    typeof crypto.randomUUID === 'function'
  ) {
    return crypto.randomUUID()
  }
  // Fallback: timestamp (base 36) + counter + a couple of
  // Math.random words. Unique enough for channel-name dedup;
  // not cryptographically random and not claimed to be.
  counter += 1
  const t = Date.now().toString(36)
  const c = counter.toString(36)
  const r1 = Math.random().toString(36).slice(2, 10)
  const r2 = Math.random().toString(36).slice(2, 10)
  return `${t}-${c}-${r1}${r2}`
}
