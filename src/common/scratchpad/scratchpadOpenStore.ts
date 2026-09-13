// cs-audited-scratchpad

import { useSyncExternalStore } from 'react'
import { readStored, writeStored } from '../web-storage/storage'

/**
 * Shared open/closed state for the scratchpad panel.
 *
 * Its writers sit in different subtrees — the header's `<ScratchpadButton>`,
 * which also binds `⌥S`, and `<GameScratchpadCompanion>` for its own close —
 * and the companion reads it to decide whether to render the panel at all.
 * So the flag lives outside the component tree in a small pub-sub store.
 * Subscribers use `useIsScratchpadOpen()`; writers call
 * `setScratchpadOpen(next)`.
 *
 * The module holds the value for the life of the tab, so moving between
 * games keeps it on its own; the localStorage mirror is what carries it
 * across a reload.
 */
const KEY = 'puzpuzpuz:scratchpad:open'

function readInitial(): boolean {
  // No storage means closed, same as never having opened it.
  return readStored('local', KEY, null) === '1'
}

let open = readInitial()
const listeners = new Set<() => void>()

function emit(): void {
  for (const l of listeners) l()
}

/** Idempotent set + localStorage mirror + notify. */
export function setScratchpadOpen(next: boolean): void {
  if (next === open) return
  open = next
  writeStored('local', KEY, next ? '1' : '0')
  emit()
}

/** The current value without subscribing. This is a seam for TESTS, which need
 *  the flag where there is no component to render. In the app, read it with
 *  `useIsScratchpadOpen()` — same split as `chatOpenStore`. */
export function getScratchpadOpen(): boolean {
  return open
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener)
  return () => {
    listeners.delete(listener)
  }
}

export function useIsScratchpadOpen(): boolean {
  return useSyncExternalStore(
    subscribe,
    () => open,
    () => open,
  )
}
