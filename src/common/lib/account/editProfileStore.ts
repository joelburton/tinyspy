import { useSyncExternalStore } from 'react'

/**
 * Shared open/closed state for the Edit-profile dialog.
 *
 * The dialog itself is mounted once at the App level, deliberately: it's a
 * `<FloatingPanel>`, and mounting one deep inside a page's flex column makes
 * react-rnd position it from that column's offset (docs/ui.md → FloatingPanel's
 * gotcha). But the thing that OPENS it is now a menu item on three different
 * pages — the account submenu lives in GamePage's, ClubPage's and HomePage's
 * menus, since the fixed top-right UserMenu it used to live in was costing the
 * game header 2rem of reserved width it couldn't spare on a phone.
 *
 * So the opener and the dialog are in different subtrees, and the flag has to
 * live outside both. Same tiny pub-sub shape as `chatOpenStore` and the profile
 * store — minus the localStorage mirror, because "was I editing my profile" is
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

/** Subscribe to the dialog's open state. App uses this to decide whether to
 *  mount `<EditProfileDialog>`. */
export function useEditProfileOpen(): boolean {
  return useSyncExternalStore(subscribe, getSnapshot)
}
