import { useEffect, useState } from 'react'
import type { Session } from '@supabase/supabase-js'
import { db as commonDb } from '../db'

/** The slice of `common.profiles` the FE consumes today — the
 *  identity fields used by greetings, the user menu badge, etc.
 *  Add more columns as a real consumer arrives; the hook returns
 *  the whole row so subscribers don't have to refetch. */
export type Profile = {
  username: string
  color: string
}

/**
 * Look up the caller's profile row from `common.profiles`.
 *
 * Returns `null` while the fetch is in flight (or if the row is
 * missing); switches to the resolved profile once it lands.
 * Consumers typically render a placeholder (`…` / fallback color)
 * for the null tier.
 *
 * Dep is the user id (not the full session object), so background
 * token refreshes — which return a new Session reference with the
 * same user — don't trigger a refetch.
 *
 * Multiple consumers in the same tree each fetch independently
 * (UserMenu + HomePage both call this on initial mount). One
 * query per consumer is acceptable for a tiny lookup; if a third
 * consumer arrives or this gets called from a deep tree, lift
 * the state into a shared store (cf. chatOpenStore).
 */
export function useProfile(session: Session): Profile | null {
  const [profile, setProfile] = useState<Profile | null>(null)

  useEffect(function loadProfile() {
    let mounted = true
    commonDb
      .from('profiles')
      .select('username, color')
      .eq('user_id', session.user.id)
      .single()
      .then(({ data, error }) => {
        if (!mounted) return
        if (error) {
          console.error('failed to load profile', error)
          return
        }
        setProfile({ username: data.username, color: data.color })
      })
    return () => {
      mounted = false
    }
  }, [session.user.id])

  return profile
}
