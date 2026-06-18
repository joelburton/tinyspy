import { useEffect, useState } from 'react'
import type { Session } from '@supabase/supabase-js'
import { db as commonDb } from '../db'

/**
 * Look up the caller's username from `common.profiles`.
 *
 * Returns `null` while the fetch is in flight (or if the row
 * is missing); switches to the resolved string once it lands.
 * Consumers typically render a placeholder (`…` / `Loading…`)
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
export function useUsername(session: Session): string | null {
  const [username, setUsername] = useState<string | null>(null)

  useEffect(function loadUsername() {
    let mounted = true
    commonDb
      .from('profiles')
      .select('username')
      .eq('user_id', session.user.id)
      .single()
      .then(({ data, error }) => {
        if (!mounted) return
        if (error) {
          console.error('failed to load username', error)
          return
        }
        setUsername(data.username)
      })
    return () => {
      mounted = false
    }
  }, [session.user.id])

  return username
}
