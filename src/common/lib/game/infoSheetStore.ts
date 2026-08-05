import { useSyncExternalStore } from 'react'

/**
 * Which of the two mobile pages is showing: the board (false) or the info
 * column (true).
 *
 * **Why a store and not component state.** The two halves live in different
 * subtrees. The *sheet* is rendered by each game's PlayArea (it wraps that
 * game's `<InfoCol>`), but the *switch button* that flips it — and the header
 * contents that swap with it — belong to the shell's `<GamePage>` header, which
 * sits above PlayArea and re-renders independently of it. Threading a flag down
 * would mean adding it to `GamePageCtx` and touching all thirteen games;
 * lifting the sheet out of PlayArea isn't possible, because the InfoCol it
 * wraps is the game's.
 *
 * A module-level slot is safe here for the same structural reason the app has
 * one game at a time (`is_current_view` — see docs/common.md): only one
 * `<GamePage>` is ever mounted, and it's keyed by game id so a game→game
 * navigation remounts it. `GamePage` resets the flag on mount so a sheet left
 * open in one game never greets you already-open in the next.
 *
 * Desktop ignores this entirely — there the info column is always visible and
 * `<InfoSheet>` is a `display: contents` no-op.
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

/** Read the current page without subscribing — for click handlers. */
export function getInfoSheetOpen(): boolean {
  return value
}

/** Subscribe to which page is showing. */
export function useInfoSheetOpen(): boolean {
  return useSyncExternalStore(subscribe, getSnapshot)
}
