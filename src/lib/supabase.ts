import { createClient } from '@supabase/supabase-js'
import type { Database } from '../types/db'

const url = import.meta.env.VITE_SUPABASE_URL
const publishableKey = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY

if (!url || !publishableKey) {
  throw new Error('Missing VITE_SUPABASE_URL or VITE_SUPABASE_PUBLISHABLE_KEY')
}

export const supabase = createClient<Database>(url, publishableKey, {
  auth: {
    // Persist + auto-refresh the session in localStorage so refresh keeps
    // the user logged in. These are the supabase-js defaults but stating
    // them explicitly makes the contract obvious.
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: true,
  },
})
