import type { BrowserContext } from '@playwright/test'
import type { Session } from '@supabase/supabase-js'

/** supabase-js's localStorage key for the LOCAL project (URL host
 *  `127.0.0.1` → `sb-127-auth-token`). Verified empirically against
 *  the bundled client; if the local URL ever changes, recompute via
 *  `createClient(url, key).auth.storageKey`. */
const STORAGE_KEY = 'sb-127-auth-token'

/**
 * Sign a browser context in as a given user by seeding the Supabase
 * session into localStorage BEFORE the app's JS runs. supabase-js
 * reads it on init (persistSession: true), so the app boots already
 * authenticated — no magic-link flow to drive in a test.
 *
 * `addInitScript` runs on every page/navigation in the context, so
 * the session survives reloads within the test.
 */
export async function signIn(context: BrowserContext, session: Session): Promise<void> {
  await context.addInitScript(
    ([key, value]) => window.localStorage.setItem(key, value),
    [STORAGE_KEY, JSON.stringify(session)] as const,
  )
}
