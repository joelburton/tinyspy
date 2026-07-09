import { createClient } from '@supabase/supabase-js'
import type { Database } from '../../../types/db'

/**
 * The single Supabase client used everywhere in the app.
 *
 * Typed against the generated `Database` schema, which has one
 * top-level key per exposed Postgres schema. Game-specific tables
 * and RPCs are reached via `.schema('<game>')`:
 *
 *     supabase.schema('codenamesduet').from('games').select(...)
 *     supabase.schema('codenamesduet').rpc('start_game', {...})
 *     supabase.schema('common').from('profiles').select(...)
 *
 * Auth, Edge Functions, and Realtime channels operate on the raw
 * client (no `.schema()`). Re-run `npm run types:gen` after any
 * schema change.
 *
 * Configured for an SPA with localStorage-backed session persistence
 * (the supabase-js defaults). On every session restore we check that
 * the user the JWT points at still exists — see useSession.ts. The
 * check looks up `common.profiles` because (a) we can't read
 * auth.users directly from the FE, and (b) profiles cascades from
 * auth.users, so its presence is a reliable proxy. Catches stale
 * JWTs left over from a `supabase db reset` or admin-deleted users
 * in prod.
 */

const publishableKey = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY

/**
 * In dev, when `VITE_SUPABASE_URL` points at a loopback host (127.0.0.1 /
 * localhost) but the page itself was loaded from a LAN address, rewrite the
 * Supabase host to match the page's host.
 *
 * The motivating case: testing on a phone. You run `npm run dev -- --host` and
 * open `http://<mac-lan-ip>:5173` on the phone, but the app is still configured
 * to reach Supabase at `127.0.0.1:54321` — which, on the phone, is the *phone*,
 * not the Mac, so every request fails ("Load failed"). Local Supabase binds
 * `0.0.0.0`, so `<mac-lan-ip>:54321` reaches the same stack; pointing the client
 * at the page's own host makes it Just Work over the LAN without hardcoding the
 * Mac's IP into `.env.local` (which would break plain `localhost` dev, and
 * changes every time the DHCP lease does).
 *
 * No-op in prod (the configured URL isn't loopback) and when the page is already
 * on a loopback host (normal laptop dev) — so it only ever engages for the
 * phone-over-LAN case it's meant for.
 */
function resolveSupabaseUrl(configured: string): string {
  if (!import.meta.env.DEV || typeof window === 'undefined') return configured
  let parsed: URL
  try {
    parsed = new URL(configured)
  } catch {
    return configured
  }
  const loopback = (host: string) => host === '127.0.0.1' || host === 'localhost'
  const pageHost = window.location.hostname
  if (!loopback(parsed.hostname) || loopback(pageHost)) return configured
  parsed.hostname = pageHost
  const rebuilt = parsed.toString()
  // new URL().toString() appends a trailing slash to a bare-origin URL; keep the
  // configured value's convention so supabase-js doesn't see a doubled slash.
  return rebuilt.endsWith('/') && !configured.endsWith('/')
    ? rebuilt.slice(0, -1)
    : rebuilt
}

const url = resolveSupabaseUrl(import.meta.env.VITE_SUPABASE_URL)

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
