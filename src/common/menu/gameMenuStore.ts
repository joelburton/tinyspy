// cs-unmet

import { useSyncExternalStore } from 'react'
import type { MenuSection } from './menuModel'

/**
 * The sections a game has pushed into the header menu.
 *
 * **Why this is not `useState` on the game page.** It was, and pushing a menu
 * therefore re-rendered the whole page — the board included — for a change that
 * only the menu can see. Worse, it made the identity of a menu row load-bearing:
 * a game's menu effect lists its rows in its deps, so a row rebuilt each render
 * would set state, re-render, rebuild and loop. (Verified 2026-09-10; the probe
 * hung.) That is a trap laid for whoever next writes a row, and nothing about
 * the menu wanted it.
 *
 * Here the push notifies subscribers, and the only subscriber is the menu. A
 * game re-rendering costs the menu nothing, and a menu push costs the game
 * nothing. Identity is now an optimization — an unstable row rebuilds the menu
 * more often than it needs to — rather than the difference between working and
 * hanging.
 *
 * **Why a module slot is safe.** One game page is mounted at a time and it has
 * one header menu, so there is nothing to arbitrate — the same structural
 * argument `pageMenuStore` and `infoSheetStore` make. The page clears it on
 * unmount, so a menu cannot outlive the game that pushed it.
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
