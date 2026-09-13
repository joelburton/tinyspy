// cs-audited-definitions

import { useSyncExternalStore } from 'react'

/** The open lookup: the word, and the rect the card points at. */
export type Defining = { word: string; rect: DOMRect }

/**
 * THE ONE OPEN DEFINITION — a module-level slot, the same shape as
 * `toastStore`: `<DefinableWord>` writes it, `<DefinitionHost>` reads it.
 * Why one slot at the root and not state per surface: doc.md → Design.
 */
let defining: Defining | null = null
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
function getSnapshot(): Defining | null {
  return defining
}

/**
 * Open the definition card for `word`, pointing at `el` — the element that was
 * clicked, whose rect is measured now.
 */
export function defineWord(word: string, el: HTMLElement): void {
  defining = { word, rect: el.getBoundingClientRect() }
  emit()
}

/** Close the card. A no-op when nothing is open. */
export function closeDefinition(): void {
  if (defining === null) return
  defining = null
  emit()
}

/** Subscribe to the open lookup — `<DefinitionHost>` is the only reader. */
export function useDefining(): Defining | null {
  return useSyncExternalStore(subscribe, getSnapshot, getSnapshot)
}
