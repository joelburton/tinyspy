// cs-blessed-info-sheet

import { useSyncExternalStore } from 'react'

/**
 * Which of the two mobile pages is showing: the board (false) or the info
 * column (true).
 *
 * A module slot rather than component state, because the two halves live in
 * different subtrees — the sheet is each game's PlayArea, the switch button is
 * the shell's header — so neither can hold the flag for the other; doc.md →
 * Details has the argument, and why one slot is safe. `GamePage` resets it
 * on mount, so a sheet left open in one game never greets you already-open in
 * the next. Desktop ignores the flag entirely: there the info column is always
 * visible and `<InfoSheet>` is a `display: contents` no-op.
 */

let isInfoSheetOpen = false
// A listener is a callback: each `useIsInfoSheetOpen()` caller adds one, and
// `setIsInfoSheetOpen` calls every one to say the flag has changed.
const listeners = new Set<() => void>()

function subscribe(listener: () => void): () => void {
  listeners.add(listener)
  return () => {
    listeners.delete(listener)
  }
}

function getIsInfoSheetOpen(): boolean {
  return isInfoSheetOpen
}

/** Show the info page (true) or the board (false). Idempotent. */
export function setIsInfoSheetOpen(val: boolean): void {
  if (isInfoSheetOpen === val) return
  isInfoSheetOpen = val
  for (const listener of listeners) listener()
}

/** Subscribe to which page is showing. */
export function useIsInfoSheetOpen(): boolean {
  return useSyncExternalStore(subscribe, getIsInfoSheetOpen)
}
