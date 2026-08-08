import { useEffect, useSyncExternalStore } from 'react'
import type { Session } from '@supabase/supabase-js'
import { db as commonDb } from '../../db'

/** The slice of `common.profiles` the FE consumes today — the
 *  identity fields used by greetings, the user menu badge, etc.
 *  Add more columns as a real consumer arrives. */
export type Profile = {
  username: string
  color: string
  /** May this user edit the shared dictionary? Drives the edit-word link in
   *  DefinitionView + the account menu's "Add word" (granted by hand in SQL
   *  — see the column's comment in the common migration). */
  can_edit_words: boolean
}

/**
 * Single-source-of-truth for the signed-in user's profile, lifted out
 * of the component tree into a tiny pub-sub store (cf. chatOpenStore).
 *
 * Why a store rather than a per-component fetch: the profile color is
 * now editable (the "Edit profile" dialog), and several components read
 * it independently (the account menu row, the HomePage greeting). A store
 * lets a save propagate to all of them at once via `setProfileColor`,
 * with no refetch, reload, or realtime channel. There's only ever one
 * signed-in user per tab, so one module-level slot is correct.
 */
let current: Profile | null = null
let loadedFor: string | null = null
const listeners = new Set<() => void>()

function notify() {
  for (const l of listeners) l()
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener)
  return () => {
    listeners.delete(listener)
  }
}

function getSnapshot(): Profile | null {
  return current
}

// Load once per user. Re-running for the same id (page navigation,
// token refresh) is a no-op, so the cached value survives remounts
// without a flicker. A user change resets and refetches.
async function ensureLoaded(userId: string) {
  if (loadedFor === userId) return
  loadedFor = userId
  current = null
  notify()
  const { data, error } = await commonDb
    .from('profiles')
    .select('username, color, can_edit_words')
    .eq('user_id', userId)
    .single()
  if (loadedFor !== userId) return // a newer load superseded this one
  if (error) {
    console.error('failed to load profile', error)
    // Clear the load marker so a later mount / navigation retries. Without
    // this the failed first fetch is permanent for the session — every
    // `ensureLoaded` no-ops on the `loadedFor === userId` guard above and
    // the account menu row shows "…" until a full reload.
    loadedFor = null
    return
  }
  current = { username: data.username, color: data.color, can_edit_words: data.can_edit_words }
  notify()
}

/**
 * The caller's profile (`username` + `color`), or `null` while the
 * first fetch is in flight. Dep is the user id, so background token
 * refreshes don't refetch. Same signature as before — consumers are
 * unchanged; they just get live updates for free now.
 */
export function useProfile(session: Session): Profile | null {
  const userId = session.user.id
  useEffect(() => {
    void ensureLoaded(userId)
  }, [userId])
  return useSyncExternalStore(subscribe, getSnapshot)
}

/**
 * Reflect a just-saved color across every consumer in the tab. The
 * `common.update_profile_color` RPC has already persisted it; this is
 * the optimistic in-memory update so every reader (and any other
 * reader) repaints immediately.
 */
/**
 * The already-loaded profile snapshot, for components with no `session` in
 * reach (DefinitionView renders inside popovers far from the page shell).
 * Subscribe-only: it never triggers a load — but the account menu calls
 * `useProfile` on every page, so the store is warm in practice; a cold
 * store just means the editor link stays hidden, which is the safe default.
 */
export function useCurrentProfile(): Profile | null {
  return useSyncExternalStore(subscribe, getSnapshot)
}

export function setProfileColor(color: string) {
  if (current) {
    current = { ...current, color }
    notify()
  }
}
