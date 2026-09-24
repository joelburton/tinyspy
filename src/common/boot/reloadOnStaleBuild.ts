// cs-unmet

import { readStored, writeStored } from '../web-storage/storage'
import { rememberReloadForUpdate } from './reloadNotice'

/**
 * Reload the page when the build it is running has been replaced by a deploy —
 * the half of stale-deploy recovery that `reloadOnStaleChunk` cannot see.
 *
 * A tab left open across a deploy fails in two ways. If it still needs a chunk,
 * that chunk is gone and `reloadOnStaleChunk` catches the failed import. If
 * every chunk it needs is already in memory, nothing fetches and nothing
 * throws: old code just runs against a server that has moved on, and every
 * wire-shape change makes it silently wrong (common/boot/doc.md
 * has the incident). No loader hook can see a module that is already loaded,
 * so this half asks the server directly.
 *
 * The vite build stamps the bundle with the moment it was built and writes the
 * same stamp to `version.json` beside it — one command emits both, so a deploy
 * cannot ship one without the other (vite.config.ts). This fetches the file
 * and compares it against the constant baked into this tab's own code. Never
 * against storage: two tabs of different ages would overwrite each other's
 * notion of "current".
 *
 * Under `vite dev` there is no `version.json` (the dev server answers with the
 * SPA's HTML), so the check quietly does nothing; the unit test is the way to
 * see it work.
 */

export type BuildStamp = {
  // When the build ran, ISO 8601. The identity: two builds never share one.
  built: string
  // The commit it was built from, short; `-dirty` when the tree had edits.
  // For a report, not for the comparison.
  sha: string
}

// Replaced by vite at build time with the stamp it also writes to version.json.
declare const __BUILD_STAMP__: BuildStamp

/** What this tab was built from — the constant the fetched stamp is compared to. */
export const BUILD_STAMP: BuildStamp = __BUILD_STAMP__

const STAMP_URL = '/version.json'

// How often a returning tab may ask. Focus and visibility fire on every
// alt-tab; the request is a cheap conditional GET, but a few minutes between
// them keeps a person flipping windows from hammering it, and a stale tab is
// still caught within minutes of their return.
const RETURN_FLOOR_MS = 5 * 60_000

// The stamp this tab last reloaded for. A Netlify deploy takes a moment to
// settle across its CDN, so a reload can land on the old build while
// version.json already says the new one; remembering the value reloaded for
// turns that race into one spurious reload rather than a loop.
const RELOADED_FOR_KEY = 'puzpuzpuz:stale-build:reloadedFor'

/**
 * Why the check is being run. The return trigger fires constantly and respects
 * the floor; the other two are one-offs at a moment that earns the request.
 */
export type StaleBuildTrigger =
  // The tab became visible, gained focus, or the network came back.
  | 'returned'
  // A game page is being entered — a chunk is fetched here anyway.
  | 'game-page'
  // The server answered in a shape this build has no branch for.
  | 'unhandled-answer'

let lastCheckedAt = 0

/**
 * Fetch the deployed stamp and reload if it is not this tab's. Resolves `true`
 * when a reload has been requested — the caller should then do nothing more,
 * since the page is about to go — and `false` when the tab is current, the
 * check was skipped (the floor, or already reloaded for this very stamp), or
 * nothing could be learned (offline, dev, a bad answer).
 */
export async function reloadIfStaleBuild(trigger: StaleBuildTrigger): Promise<boolean> {
  const now = Date.now()
  if (trigger === 'returned' && now - lastCheckedAt < RETURN_FLOOR_MS) return false
  lastCheckedAt = now

  const deployed = await fetchStamp()
  if (!deployed || deployed.built === BUILD_STAMP.built) return false

  // Fails closed, like `reloadOnStaleChunk`'s guard: where storage cannot be
  // read the stand-in is "already reloaded for this one", and the recovery is
  // given up rather than made uncountable.
  if (readStored('session', RELOADED_FOR_KEY, deployed.built) === deployed.built) return false
  writeStored('session', RELOADED_FOR_KEY, deployed.built)
  rememberReloadForUpdate()
  window.location.reload()
  return true
}

/**
 * Start checking whenever the person comes back to the tab — visible again,
 * focused, or back online: the same three events `useRealtimeReconnect`
 * treats as "back after being away". Call once at boot.
 */
export function watchForStaleBuild(): void {
  const onReturn = () => {
    if (document.visibilityState === 'visible') void reloadIfStaleBuild('returned')
  }
  document.addEventListener('visibilitychange', onReturn)
  window.addEventListener('focus', onReturn)
  window.addEventListener('online', onReturn)
}

// The deployed stamp, or null for anything that is not one: a failed request,
// a non-2xx, the dev server's HTML fallback, a body of the wrong shape.
async function fetchStamp(): Promise<BuildStamp | null> {
  try {
    const res = await fetch(STAMP_URL, { cache: 'no-cache' })
    if (!res.ok) return null
    const body: unknown = await res.json()
    return isBuildStamp(body) ? body : null
  } catch {
    return null
  }
}

function isBuildStamp(v: unknown): v is BuildStamp {
  return (
    typeof v === 'object' && v !== null &&
    typeof (v as BuildStamp).built === 'string' &&
    typeof (v as BuildStamp).sha === 'string'
  )
}
