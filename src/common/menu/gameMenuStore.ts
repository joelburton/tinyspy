// cs-blessed-menu

import { useSyncExternalStore } from 'react'
import type { MenuSection } from './menuModel'

/**
 * The sections a game has pushed into the header menu. A PlayArea writes
 * through `MenuApi.setGameSections`; the header menu is the one reader.
 *
 * A module slot rather than page state, so a push re-renders the menu and not
 * the page and board with it — doc.md → Intro to area has the argument, and why one
 * slot is safe. The page clears it on unmount, so a menu cannot outlive the
 * game that pushed it.
 */

let sections: MenuSection[] = []
const listeners = new Set<() => void>()

/** Replace the game's sections. `[]` clears them — what a PlayArea's effect
 *  cleanup does, so unmounting empties the menu. */
export function setGameMenuSections(next: MenuSection[]): void {
  sections = next
  for (const listener of listeners) listener()
}

/** What the game has pushed, re-rendering the caller when it changes. The
 *  menu, and nothing else. */
export function useGameMenuSections(): MenuSection[] {
  return useSyncExternalStore(subscribe, () => sections)
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener)
  return () => {
    listeners.delete(listener)
  }
}
