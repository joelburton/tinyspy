// cs-audited-session

import { useCallback, useEffect, useState } from 'react'
import type { Session } from '@supabase/supabase-js'
import { supabase } from '../supabase/supabase'
import { db } from '../supabase/db'
import { readRows } from '../supabase/dbResult'
import type { NotOkEnvelope } from '../supabase/envelope'
import { setProfile } from './useProfile'

/**
 * Source of truth for "is there a logged-in user, and have they
 * claimed a username yet."
 *
 * Four resolved states (the first three driven by the absence/presence
 * of a common.profiles row for the signed-in user):
 *
 *   { session: null,      needsClaim: false }  → signed out
 *   { session: <Session>, needsClaim: true  }  → signed in but
 *                                                no profile row yet
 *   { session: <Session>, needsClaim: false }  → signed in + claimed
 *   { session: <Session>, probeFailed: <envelope> }
 *                                              → the read failed, so
 *                                                which of the two
 *                                                above is unknown
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
  const [probeFailed, setProbeFailed] = useState<NotOkEnvelope | null>(null)

  // The four states below are all "nobody is signed in as far as the app is
  // concerned", and the profile store has to be emptied with them or a
  // signed-out tab keeps showing the last user's name and color.
  const resolveSignedOut = useCallback(() => {
    setProfile(null)
    setSession(null)
    setHasProfile(false)
    setProbeFailed(null)
    setLoading(false)
  }, [])

  // Read the signed-in user's profiles row. Whether it exists is the claim
  // gate; what it contains seeds the profile store, so this is the only read
  // of that row the app makes. A point lookup on the primary key.
  const probeProfile = useCallback(
    async (next: Session | null, mountedRef: { value: boolean }) => {
      if (!next) {
        if (mountedRef.value) resolveSignedOut()
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
          resolveSignedOut()
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
        resolveSignedOut()
        return
      }

      const res = await readRows(
        db
          .from('profiles')
          .select('username, color, can_edit_words')
          .eq('user_id', next.user.id),
        // `presentFaults: false` because a failed probe becomes the whole page
        // below, and the modal on top of it would say the same thing twice.
        { presentFaults: false },
      )
      if (!mountedRef.value) return
      if (res.type === 'not-ok') {
        // Without the row we do not know whether this person has claimed a
        // username, and both guesses are wrong in a way they can see: the claim
        // screen asks someone to pick a handle they may already own, and the
        // app behind the gate would render as a stranger. So the failure is a
        // state of its own, and `App` gives it the error page.
        setProfile(null)
        setSession(next)
        setHasProfile(false)
        setProbeFailed(res)
        setLoading(false)
        return
      }
      // ZERO ROWS is the answer this probe exists to get: no profile means the
      // user has not claimed a username yet. It is not a failure, which is why
      // the read does not ask PostgREST for a single row — that would make the
      // ordinary first-sign-in case an error.
      const row = res.data[0] ?? null
      // Seeded before `loading` clears, so the first render of the account menu
      // already has a username rather than a placeholder.
      setProfile(row)
      setSession(next)
      setHasProfile(row !== null)
      setProbeFailed(null)
      setLoading(false)
    },
    [resolveSignedOut],
  )

  useEffect(function subscribeToAuthState() {
    const mountedRef = { value: true }

    const { data: sub } = supabase.auth.onAuthStateChange((event, next) => {
      if (event === 'SIGNED_OUT' || !next) {
        if (!mountedRef.value) return
        resolveSignedOut()
        return
      }
      probeProfile(next, mountedRef)
    })

    return () => {
      mountedRef.value = false
      sub.subscription.unsubscribe()
    }
  }, [probeProfile, resolveSignedOut])

  // Public refresh — call after a successful claim_username to
  // flip needsClaim → false without re-authenticating.
  const refresh = useCallback(async () => {
    const mountedRef = { value: true }
    await probeProfile(session, mountedRef)
  }, [probeProfile, session])

  return {
    session,
    needsClaim: session !== null && !hasProfile && probeFailed === null,
    probeFailed,
    loading,
    refresh,
  }
}
