// cs-blessed-account

import { useSyncExternalStore } from 'react'

/**
 * **Is the Edit-profile dialog open?** — written by the account submenu's
 * `act-edit-profile`, read by `App`, which mounts `<EditProfileModal>` on it.
 *
 * The opener and the dialog share no parent (doc.md → Design), so the flag
 * lives outside both. Same tiny pub-sub shape as `chatOpenStore` and the
 * profile store, minus the localStorage mirror: "was I editing my profile" is
 * not worth restoring across a navigation.
 */

let value = false
const listeners = new Set<() => void>()

function subscribe(listener: () => void): () => void {
  listeners.add(listener)
  return () => {
    listeners.delete(listener)
  }
}

function getSnapshot(): boolean {
  return value
}

/** Open or close the Edit-profile dialog. Idempotent — a same-value write
 *  notifies nobody. */
export function setEditProfileOpen(next: boolean): void {
  if (value === next) return
  value = next
  for (const listener of listeners) listener()
}

/** Whether the Edit-profile dialog is open. `App` reads it to decide whether
 *  to mount `<EditProfileModal>`. */
export function useIsEditProfileOpen(): boolean {
  return useSyncExternalStore(subscribe, getSnapshot)
}
