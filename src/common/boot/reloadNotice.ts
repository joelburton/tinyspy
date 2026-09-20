// cs-unmet

import { readStored, removeStored, writeStored } from '../web-storage/storage'

/**
 * The note a self-reload leaves for the page that comes back: "this tab
 * reloaded to pick up an update". `reloadOnStaleChunk` and `reloadOnStaleBuild`
 * both write it just before `location.reload()`; `App` reads it once after
 * boot and says so in a toast, so a person whose page just rebuilt under them
 * is told why rather than left guessing.
 *
 * Session storage, because the note is for THIS tab's next page load and
 * nothing else — a second tab must not announce a reload it never did.
 */

const NOTICE_KEY = 'puzpuzpuz:reloaded-for-update'

/** Leave the note. Call right before `location.reload()`. */
export function rememberReloadForUpdate(): void {
  writeStored('session', NOTICE_KEY, '1')
}

/** Take the note, if there is one. True once per reload; the second read is
 *  false, so StrictMode's double effect announces once. */
export function consumeReloadForUpdate(): boolean {
  const had = readStored('session', NOTICE_KEY, null) !== null
  if (had) removeStored('session', NOTICE_KEY)
  return had
}
