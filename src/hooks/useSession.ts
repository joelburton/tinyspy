import { useEffect, useState } from 'react'
import type { Session } from '@supabase/supabase-js'
import { supabase } from '../lib/supabase'

/**
 * Source of truth for "is there a logged-in user, and who are they".
 *
 * Returns the current Supabase session (or null), plus a `loading` flag
 * that's true until the initial restore + profile-verify finishes.
 *
 * On mount, subscribes to `onAuthStateChange`. Supabase fires an
 * INITIAL_SESSION event on subscribe with the localStorage-restored
 * session, so we don't need a separate getSession() call. Subsequent
 * SIGNED_IN / SIGNED_OUT / TOKEN_REFRESHED events update state too.
 *
 * Each non-null session is run through `verifyAndSet`, which checks
 * that a matching profile row still exists — see the comment there.
 */
export function useSession() {
  const [session, setSession] = useState<Session | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let mounted = true

    // The JWT in localStorage is signature-valid even after the user's row in
    // auth.users is gone (e.g. after a local `supabase db reset` during dev,
    // or an admin-deleted user in prod). PostgREST happily lets requests
    // through with that JWT, but writes to game_players then trip the
    // user_id FK because the cascade dropped profiles too. Catch this on
    // restore by checking that a profile still exists; if not, clear the
    // stale session so the user re-authenticates cleanly.
    async function verifyAndSet(next: Session | null) {
      if (!mounted) return
      if (!next) {
        setSession(null)
        setLoading(false)
        return
      }
      const { data, error } = await supabase
        .from('profiles')
        .select('user_id')
        .eq('user_id', next.user.id)
        .maybeSingle()
      if (!mounted) return
      if (error) {
        // Network/RLS hiccup — don't punish the user, assume the session is valid.
        console.warn('profile verify failed', error)
        setSession(next)
        setLoading(false)
        return
      }
      if (!data) {
        // No profile → stale session. signOut emits SIGNED_OUT below.
        await supabase.auth.signOut()
        return
      }
      setSession(next)
      setLoading(false)
    }

    // onAuthStateChange fires an INITIAL_SESSION event on subscribe with the
    // currently-stored session, so we don't need a separate getSession() call —
    // doing both would double the verify query on every page load.
    const { data: sub } = supabase.auth.onAuthStateChange((event, next) => {
      if (event === 'SIGNED_OUT' || !next) {
        setSession(null)
        setLoading(false)
        return
      }
      verifyAndSet(next)
    })

    return () => {
      mounted = false
      sub.subscription.unsubscribe()
    }
  }, [])

  return { session, loading }
}
