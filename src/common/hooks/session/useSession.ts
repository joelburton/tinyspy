import { useCallback, useEffect, useState } from 'react'
import type { Session } from '@supabase/supabase-js'
import { supabase } from '../../lib/supabase/supabase'
import { db } from '../../db'

/**
 * Source of truth for "is there a logged-in user, and have they
 * claimed a username yet."
 *
 * Three resolved states (driven by the absence/presence of a
 * common.profiles row for the signed-in user):
 *
 *   { session: null,      needsClaim: false }  → signed out
 *   { session: <Session>, needsClaim: true  }  → signed in but
 *                                                no profile row yet
 *   { session: <Session>, needsClaim: false }  → signed in + claimed
 *
 * The "needs claim" state replaces the old auto-derived-username
 * trigger flow: the auth.users row is created by Supabase Auth at
 * magic-link verification time, but the profiles row only appears
 * when the user explicitly claims a handle (via the
 * `common.claim_username` RPC). The FE gates everything except
 * <ClaimHandleScreen> on `!needsClaim`.
 *
 * `refresh()` re-runs the profile probe — used by
 * ClaimHandleScreen to advance the app state after a successful
 * claim_username RPC without forcing a re-auth.
 *
 * Stale-session edge case (db:reset wiped auth.users while a JWT
 * is still in localStorage, OR a user was deleted from auth.users
 * in prod while their tab was open): handled upfront via
 * `supabase.auth.getUser()`, which makes a server round-trip that
 * validates the JWT against auth.users. Any non-transient failure
 * (the user is gone, the token/refresh is invalid, the session is
 * missing) means we sign out so the next render falls back to
 * LoginScreen rather than routing to ClaimHandleScreen (the previous
 * behavior was "ask them to pick a username, fail with 23503 on
 * submit," which surfaces the orphan state as a confusing error
 * rather than a clean restart). See the inline note on what counts as
 * transient (and thus permissive). As a last-resort safety net,
 * ClaimHandleScreen itself also offers a sign-out, so a user can
 * never get fully stuck there.
 */
export function useSession() {
  const [session, setSession] = useState<Session | null>(null)
  const [hasProfile, setHasProfile] = useState(false)
  const [loading, setLoading] = useState(true)

  // Probe whether the signed-in user has claimed a username (i.e.
  // a profiles row exists). RLS on profiles is public-read, so this
  // is a single point-lookup with no FK indirection.
  const probeProfile = useCallback(
    async (next: Session | null, mountedRef: { value: boolean }) => {
      if (!next) {
        if (mountedRef.value) {
          setSession(null)
          setHasProfile(false)
          setLoading(false)
        }
        return
      }

      // Validate the JWT against auth.users before trusting it.
      // The session object in localStorage is whatever was cached
      // at sign-in time; supabase-js doesn't re-verify it on app
      // load. So a stored JWT can outlive the user it references —
      // db:reset (dev) or a delete-user in prod both produce that
      // state. getUser() is the documented "round-trip and check"
      // call; a 4xx response means the user is no longer in
      // auth.users. Treat that as definitively-signed-out.
      //
      // 5xx / network errors get the permissive treatment (same
      // friends-alpha posture as the profile-probe error below):
      // trust the stored session and proceed. The cost of "the
      // user is actually gone but we couldn't reach Supabase" is
      // a wasted ClaimHandleScreen render that the next reload
      // will correct; the cost of being strict on 5xx would be
      // booting people out every time Supabase has a hiccup.
      const { data: userRes, error: userErr } = await supabase.auth.getUser()
      if (!mountedRef.value) return
      if (userErr) {
        // Default to SIGNING OUT on any getUser failure — only a
        // genuinely transient error keeps us on the stored session.
        // "Transient" = a retryable network error, or a 5xx (Supabase
        // reachable but the response unusable); those get the permissive
        // friends-alpha treatment so a hiccup doesn't boot everyone.
        // EVERYTHING ELSE means the JWT is no good — expired, or the user
        // was deleted by db:reset / admin — so we sign out and the app
        // falls back to LoginScreen.
        //
        // This used to gate only on a clean 4xx STATUS, but the real
        // errors don't always carry one: an expired token's failed
        // refresh surfaces as AuthSessionMissingError, and other shapes
        // arrive with `status` undefined — all of which slipped through
        // to the permissive branch and stranded the user on
        // ClaimHandleScreen. Inverting the default (sign out unless
        // provably transient) closes that gap.
        const status = (userErr as { status?: number }).status
        const transient =
          userErr.name === 'AuthRetryableFetchError' ||
          (status !== undefined && status >= 500)
        if (!transient) {
          console.warn('stored session is invalid — signing out', userErr)
          await supabase.auth.signOut()
          if (!mountedRef.value) return
          setSession(null)
          setHasProfile(false)
          setLoading(false)
          return
        }
        // Transient (5xx / retryable network). Log and proceed permissively.
        console.warn('auth.getUser() failed transiently; trusting stored session', userErr)
      } else if (userRes.user === null) {
        // Defensive: 200 with `user: null` shouldn't happen per
        // the supabase-js contract, but treat it the same as a
        // 401 if it does.
        console.warn('auth.getUser() returned no user — signing out')
        await supabase.auth.signOut()
        if (!mountedRef.value) return
        setSession(null)
        setHasProfile(false)
        setLoading(false)
        return
      }

      const { data, error } = await db
        .from('profiles')
        .select('user_id')
        .eq('user_id', next.user.id)
        .maybeSingle()
      if (!mountedRef.value) return
      if (error) {
        // Network/RLS hiccup — assume the session is valid AND
        // unclaimed. The user lands on ClaimHandleScreen; if they
        // already have a profile, the eventual claim_username call
        // will fail with the explicit "profile already claimed"
        // error and the FE can recover by re-probing.
        //
        // Fragile: same over-permissive read as the previous
        // implementation. See docs/code-review-2026-06-16.md §1.3.
        console.warn('profile probe failed', error)
        setSession(next)
        setHasProfile(false)
        setLoading(false)
        return
      }
      setSession(next)
      setHasProfile(data !== null)
      setLoading(false)
    },
    [],
  )

  useEffect(function subscribeToAuthState() {
    const mountedRef = { value: true }

    const { data: sub } = supabase.auth.onAuthStateChange((event, next) => {
      if (event === 'SIGNED_OUT' || !next) {
        if (!mountedRef.value) return
        setSession(null)
        setHasProfile(false)
        setLoading(false)
        return
      }
      probeProfile(next, mountedRef)
    })

    return () => {
      mountedRef.value = false
      sub.subscription.unsubscribe()
    }
  }, [probeProfile])

  // Public refresh — call after a successful claim_username to
  // flip needsClaim → false without re-authenticating.
  const refresh = useCallback(async () => {
    const mountedRef = { value: true }
    await probeProfile(session, mountedRef)
  }, [probeProfile, session])

  return {
    session,
    needsClaim: session !== null && !hasProfile,
    loading,
    refresh,
  }
}
