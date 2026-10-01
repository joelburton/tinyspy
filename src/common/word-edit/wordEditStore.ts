// cs-blessed-definitions

import { useSyncExternalStore } from 'react'

/**
 * Shared open/closed state for the word-edit dialog — the same tiny pub-sub
 * shape as `editProfileStore`, for the same reason: the dialog mounts once
 * at the App level (a FloatingPanel deep in a page's flex column would
 * anchor to the wrong offset), but its openers live in different subtrees —
 * DefinitionView's edit link (inside a popover) and the account menu's
 * "Add word" item.
 */

export type ShownWordEditDialog =
  | { mode: 'edit'; word: string }
  | { mode: 'add' }

let shownWordEditDialog: ShownWordEditDialog | null = null
// A listener is a callback: each `useShownWordEditDialog()` caller adds one,
// and `setShownWordEditDialog` calls every one to say it has changed.
const listeners = new Set<() => void>()

function subscribe(listener: () => void): () => void {
  listeners.add(listener)
  return () => {
    listeners.delete(listener)
  }
}

function getShownWordEditDialog(): ShownWordEditDialog | null {
  return shownWordEditDialog
}

/** Open the dialog (edit a word / add one) or close it (null). */
export function setShownWordEditDialog(val: ShownWordEditDialog | null): void {
  shownWordEditDialog = val
  for (const listener of listeners) listener()
}

/** The dialog on screen, or null when none is. App uses this to decide
 *  whether to mount `<WordEditDialog>`. */
export function useShownWordEditDialog(): ShownWordEditDialog | null {
  return useSyncExternalStore(subscribe, getShownWordEditDialog)
}
