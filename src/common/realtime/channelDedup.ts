// cs-unmet

// Bumped per fallback call, so two suffixes minted in the same
// millisecond still differ.
let counter = 0

/**
 * Generate a unique-enough suffix for a supabase-js Realtime
 * channel name — and ONLY for that purpose.
 *
 * A channel name is a ROOM on the server: two browsers that pass
 * the same name land in the same room, which is how they see each
 * other's presence and hear each other's broadcasts. Two browsers
 * watching the same TABLE need nothing of the sort — the server
 * tells each one about the table independently — so a table-watching
 * channel's name is private to the browser that opened it, and is
 * free to be anything at all.
 *
 * This function spends that freedom, to dodge a collision that
 * happens INSIDE one browser (nothing to do with peers). supabase-js
 * caches channels by name, and a channel sits in that cache while it
 * is still shutting down; reopening the same name inside that window
 * — StrictMode's double-mount, or a real remount like navigating away
 * and straight back — hands you the dying instance, whose `.subscribe()`
 * never reaches SUBSCRIBED and which throws on a `.on(...)` after its
 * `.subscribe(...)`. A name that is never reused can never collide.
 * See `useGame.ts` files for the canonical example.
 *
 * **Only for channels whose name is private.** One carrying presence
 * or broadcast must keep the name its peers know, so it can't take a
 * suffix and uses `channelTeardown.ts` (wait for the old channel to
 * finish leaving) instead. A channel is in that group if ANY of its
 * cargo is shared: `game:<gameId>` carries table changes too, but its
 * presence half pins the name for the whole channel.
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
