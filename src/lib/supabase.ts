import { createClient } from '@supabase/supabase-js'
import type { Database } from '../types/db'

/**
 * The single Supabase client used everywhere in the app.
 *
 * Typed against the generated `Database` schema, so `.from('games')`,
 * `.rpc('start_game', …)`, etc. all type-check against the live SQL
 * definitions. Re-run `npm run types:gen` after any schema change.
 *
 * Configured for an SPA with localStorage-backed session persistence
 * (the supabase-js defaults). The session is verified against `profiles`
 * on every restore (see useSession.ts) to catch stale JWTs left over
 * from a `supabase db reset` or admin-deleted users.
 */

const url = import.meta.env.VITE_SUPABASE_URL
const publishableKey = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY

if (!url || !publishableKey) {
  throw new Error('Missing VITE_SUPABASE_URL or VITE_SUPABASE_PUBLISHABLE_KEY')
}

export const supabase = createClient<Database>(url, publishableKey, {
  auth: {
    // Stated explicitly — these are the supabase-js defaults but making
    // them visible documents the contract.
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: true,
  },
})
