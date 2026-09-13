// cs-audited-scratchpad

import { useSyncExternalStore } from 'react'
import { readStored, writeStored } from '../web-storage/storage'

/**
 * The scratchpad panel's open/closed state — a tiny module-level pub-sub
 * store (mirrors `chatOpenStore`), so the header bubble and the floating
 * panel share one flag without prop-drilling. Persisted to localStorage so
 * the pad feels continuous across navigations within a session.
 *
 * Like chat, "open" is an app-global toggle (one boolean), not per-game; the
 * per-game memory that matters — where the panel sits — rides the panel's own
 * `persistKey` (namespaced by gameId). See useDraggablePanel.
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
