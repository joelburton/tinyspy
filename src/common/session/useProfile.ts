// cs-audited-session

import { useSyncExternalStore } from 'react'

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
 * The signed-in user's profile, held outside the component tree in a tiny
 * pub-sub store (cf. chatOpenStore).
 *
 * Why a store rather than a per-component fetch: several components read the
 * profile without sharing a parent — the account menu row, the HomePage
 * greeting, DefinitionView inside a popover — and the color is editable, so a
 * save has to reach all of them at once. There is one signed-in user per tab,
 * so one module-level slot is correct.
 *
 * Nothing here fetches. `useSession`'s probe is the one read of the profiles
 * row, and it hands what it found to `setProfile` — so the store is filled
 * before the first page mounts, and emptied whenever the session goes away.
 */
let current: Profile | null = null
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

/**
 * Fill the store from the profiles row, or empty it — `useSession` calls this
 * as each auth event resolves. `null` is what signed-out looks like, and also
 * what a signed-in user without a claimed username looks like; either way
 * every reader falls back to its no-profile rendering.
 */
export function setProfile(next: Profile | null) {
  current = next
  notify()
}

/**
 * The signed-in user's profile, or `null` when there isn't one — signed out,
 * or signed in and not yet claimed. Subscribe-only and arg-free, so it reads
 * correctly at any depth of the tree; `useSession` is what puts a value here.
 */
export function useProfile(): Profile | null {
  return useSyncExternalStore(subscribe, getSnapshot)
}

/**
 * Reflect a just-saved color across every consumer in the tab. The
 * `common.update_profile_color` RPC has already persisted it; this is the
 * optimistic in-memory update, so every reader repaints immediately.
 */
export function setProfileColor(color: string) {
  if (current) {
    current = { ...current, color }
    notify()
  }
}
