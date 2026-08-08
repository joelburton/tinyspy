import { useSyncExternalStore } from 'react'

/**
 * Shared open/closed state for the word-edit dialog — the same tiny pub-sub
 * shape as `editProfileStore`, for the same reason: the dialog mounts once
 * at the App level (a FloatingPanel deep in a page's flex column would
 * anchor to the wrong offset), but its openers live in different subtrees —
 * DefinitionView's edit link (inside a popover) and the account menu's
 * "Add word" item.
 */

export type WordEditRequest =
  | { mode: 'edit'; word: string }
  | { mode: 'add' }

let value: WordEditRequest | null = null
const listeners = new Set<() => void>()

function subscribe(listener: () => void): () => void {
  listeners.add(listener)
  return () => {
    listeners.delete(listener)
  }
}

function getSnapshot(): WordEditRequest | null {
  return value
}

/** Open the dialog (edit a word / add one) or close it (null). */
export function setWordEdit(next: WordEditRequest | null): void {
  value = next
  for (const listener of listeners) listener()
}

/** Subscribe to the request. App uses this to decide whether to mount
 *  `<WordEditDialog>`. */
export function useWordEdit(): WordEditRequest | null {
  return useSyncExternalStore(subscribe, getSnapshot)
}
