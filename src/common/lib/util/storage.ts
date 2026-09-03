// cs-audited-utils

/**
 * Read and write `localStorage` / `sessionStorage` without the app falling over
 * when the browser refuses.
 *
 * Reach for these instead of touching storage directly: `src/guards/
 * rawStorage.test.ts` fails the build on any mention of `localStorage` or
 * `sessionStorage` outside this file and a short allowlist — the test fake
 * beside it, plus three tests that install a fake of their own. The convention
 * this replaces was held by eight files and broken by two, and those two were
 * separate bugs found in a single audit.
 *
 * **Why a wrapper at all.** A browser set to block site data doesn't return
 * `null` from these APIs — it *throws*, and it throws on the property access
 * (`window.localStorage`) as much as on the call. So the guarding has to happen
 * around the whole expression, which is why passing a storage object in would
 * defeat the point: the argument would be evaluated at the call site, outside
 * the `try`. Hence the `'local'` / `'session'` name rather than the object.
 *
 * **`whenUnavailable` has no default, on purpose.** Storage being gone is not
 * the same event as a key being absent, and the right answer differs per
 * caller. Nine of ten want "treat it as unset". `reloadOnStaleChunk` wants the
 * opposite — no storage means DON'T reload, because an uncounted reload is the
 * loop its counter exists to prevent — and a helper with a benign default would
 * have flipped that silently into an infinite reload. Making the argument
 * required is what forces the question to be answered rather than inherited.
 */

/** Which of the two web storages — named rather than passed, so the property
 *  access that can itself throw happens inside the `try`. */
export type StoreName = 'local' | 'session'

function store(name: StoreName): Storage {
  return name === 'local' ? window.localStorage : window.sessionStorage
}

/**
 * The stored string for `key`, or `null` when nothing is stored under it.
 *
 * When storage is unavailable altogether you get `whenUnavailable` — pass
 * `null` to treat that like an unset key, which is what almost every caller
 * wants, or a string to stand in for a value. It is required precisely so that
 * choice is visible at the call site.
 */
export function readStored(
  name: StoreName,
  key: string,
  whenUnavailable: string | null,
): string | null {
  try {
    return store(name).getItem(key)
  } catch {
    return whenUnavailable
  }
}

/**
 * Store `value` under `key`, or do nothing if the browser won't allow it.
 *
 * Failing silently is the whole contract: every caller's in-memory state still
 * works, and what is lost is persistence across reloads — a preference that
 * doesn't stick, not a broken feature. A write can fail where reads succeed
 * (a full quota), so this is guarded separately rather than assumed.
 */
export function writeStored(name: StoreName, key: string, value: string): void {
  try {
    store(name).setItem(key, value)
  } catch {
    // Non-fatal by design — see the docstring.
  }
}

/** Forget `key`, or do nothing if the browser won't allow it. Same posture as
 *  {@link writeStored}: losing the erasure costs a stale preference, never
 *  correctness. */
export function removeStored(name: StoreName, key: string): void {
  try {
    store(name).removeItem(key)
  } catch {
    // Non-fatal by design — see writeStored.
  }
}
