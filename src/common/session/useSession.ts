// cs-audited-session

import { useCallback, useEffect, useRef, useState } from 'react'
import type { Session } from '@supabase/supabase-js'
import { supabase } from '../supabase/supabase'
import { db } from '../supabase/db'
import { readRows } from '../supabase/dbResult'
import type { NotOkEnvelope } from '../supabase/envelope'
import { setProfile } from './useProfile'

/**
 * Who is signed in, and whether they have picked a username yet — the answer
 * `App` gates every route on.
 *
 * Four resolved states, after `loading` covers the moment before the first
 * answer:
 *
 *   { session: null,      needsClaim: false }  → signed out
 *   { session: <Session>, needsClaim: true  }  → signed in, no profile row
 *   { session: <Session>, needsClaim: false }  → signed in and claimed
 *   { session: <Session>, probeFailed: <env> } → the read failed, so which of
 *                                                the two above is true is
 *                                                unknown
 *
 * Signing in and claiming a username are two separate things. Supabase Auth
 * writes the `auth.users` row when the magic link is verified; the
 * `common.profiles` row appears only when the person picks a handle and
 * `common.claim_username` writes it. So a session by itself is not yet an
 * account this app can use, and everything except <ClaimHandleScreen> is gated
 * on `!needsClaim`.
 *
 * `refresh()` re-runs the probe. <ClaimHandleScreen> calls it after a
 * successful claim, so the gate flips without a re-auth, and the error page
 * offers it as "Try again".
 *
 * **`getUser()` runs before the profile read**, whenever a new user's session
 * arrives. What is in localStorage is whatever was cached at sign-in and the
 * client does not re-verify it, so a JWT can outlive the user it names: a
 * local `db reset` empties `auth.users` under every open tab, and deleting an
 * account in prod does the same. `getUser()` is the round trip that asks, and
 * a failure that is not provably transient signs out, so the next render is
 * <LoginScreen>. Should a stale session reach the claim screen anyway,
 * claiming raises `PN018` and that screen signs the user out — the safety net
 * under this one, and why nobody can be stuck there.
 */
export function useSession() {
  const [session, setSession] = useState<Session | null>(null)
  const [hasProfile, setHasProfile] = useState(false)
  const [loading, setLoading] = useState(true)
  const [probeFailed, setProbeFailed] = useState<NotOkEnvelope | null>(null)

  // Who the probe has an answer for. A failed probe leaves it null, so the next
  // auth event tries again rather than inheriting the failure.
  const probedFor = useRef<string | null>(null)

  // The four states below are all "nobody is signed in as far as the app is
  // concerned", and the profile store has to be emptied with them or a
  // signed-out tab keeps showing the last user's name and color.
  const resolveSignedOut = useCallback(() => {
    probedFor.current = null
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

      // Ask the server who this token belongs to before trusting it; the
      // docstring says why a stored JWT can be stale.
      const { data: userRes, error: userErr } = await supabase.auth.getUser()
      if (!mountedRef.value) return
      if (userErr) {
        // SIGN OUT unless the failure is provably transient — that way round,
        // because a stale token's errors do not all carry a status: an expired
        // token whose refresh fails arrives as AuthSessionMissingError with
        // none. So transient is tested by NAME and status, not status alone,
        // and an unrecognized shape is treated as a bad token rather than a
        // bad moment.
        //
        // Transient means a retryable fetch error or a 5xx: Supabase was
        // unreachable or unwell, which says nothing about the user. Keeping
        // the stored session then costs one wasted render that the next event
        // corrects; being strict would sign everyone out whenever Supabase
        // hiccups.
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
        probedFor.current = null
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
      probedFor.current = next.user.id
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
      // An event carrying a session rarely means a NEW user. auth-js emits
      // TOKEN_REFRESHED on every refresh, SIGNED_IN again when a tab regains
      // focus or another tab signs in, and USER_UPDATED on a profile change in
      // auth — and its own docs say to compare the user rather than trust the
      // event name. So the probe is keyed on who, not on which event: someone
      // we already have an answer for needs no round trips, only their fresher
      // token in state.
      if (next.user.id === probedFor.current) {
        if (mountedRef.value) setSession(next)
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
  // flip needsClaim → false without re-authenticating. It probes
  // unconditionally: the user is the same one, which is precisely the case the
  // event handler above skips, and the row is what changed.
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
