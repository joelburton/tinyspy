// cs-audited-info-sheet

import { useSyncExternalStore } from 'react'

/**
 * Which of the two mobile pages is showing: the board (false) or the info
 * column (true).
 *
 * A module slot rather than component state, because the two halves live in
 * different subtrees — the sheet is each game's PlayArea, the switch button is
 * the shell's header — so neither can hold the flag for the other; doc.md →
 * Intro to area has the argument, and why one slot is safe. `GamePage` resets it
 * on mount, so a sheet left open in one game never greets you already-open in
 * the next. Desktop ignores the flag entirely: there the info column is always
 * visible and `<InfoSheet>` is a `display: contents` no-op.
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

/** Show the info page (true) or the board (false). Idempotent. */
export function setInfoSheetOpen(next: boolean): void {
  if (value === next) return
  value = next
  for (const listener of listeners) listener()
}

/** Subscribe to which page is showing. */
export function useIsInfoSheetOpen(): boolean {
  return useSyncExternalStore(subscribe, getSnapshot)
}
