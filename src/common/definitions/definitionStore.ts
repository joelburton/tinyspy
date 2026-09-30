// cs-blessed-definitions

import { useSyncExternalStore } from 'react'

/** The definition card on screen: the word it starts on, and the rect it
 *  points at. */
export type ShownDefinitionCard = { word: string; rect: DOMRect }

/**
 * THE ONE SHOWN DEFINITION CARD — a module-level slot, the same shape as
 * `toastStore`: `<DefinableWord>` writes it, `<DefinitionHost>` reads it.
 * Why one slot at the root and not state per surface: doc.md → Intro to area.
 */
let shownDefinitionCard: ShownDefinitionCard | null = null
// A listener is a callback: each `useShownDefinitionCard()` caller adds one,
// and opening or closing the card calls every one to say `shownDefinitionCard`
// has changed.
const listeners = new Set<() => void>()

function emit(): void {
  for (const l of listeners) l()
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener)
  return () => listeners.delete(listener)
}

// Stable between real changes — `useSyncExternalStore` calls this on every
// render and loops if the reference moves on its own.
function getShownDefinitionCard(): ShownDefinitionCard | null {
  return shownDefinitionCard
}

/**
 * Open the definition card for `word`, pointing at `el` — the element that was
 * clicked, whose rect is measured now.
 */
export function defineWord(word: string, el: HTMLElement): void {
  shownDefinitionCard = { word, rect: el.getBoundingClientRect() }
  emit()
}

/** Close the card. A no-op when nothing is open. */
export function closeDefinition(): void {
  if (shownDefinitionCard === null) return
  shownDefinitionCard = null
  emit()
}

/** The card on screen, or null when none is — `<DefinitionHost>` is the only
 *  reader. */
export function useShownDefinitionCard(): ShownDefinitionCard | null {
  return useSyncExternalStore(subscribe, getShownDefinitionCard, getShownDefinitionCard)
}
