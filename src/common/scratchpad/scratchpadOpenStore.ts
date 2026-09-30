// cs-blessed-scratchpad

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
 * `setIsScratchpadOpen(val)`.
 *
 * The module holds the value for the life of the tab, so moving between
 * games keeps it on its own; the localStorage mirror is what carries it
 * across a reload.
 */
const KEY = 'puzpuzpuz:scratchpad:open'

// Starts as it was left, from localStorage. No storage means closed, same as
// never having opened it.
let isScratchpadOpen = readStored('local', KEY, null) === '1'
// A listener is a callback: each `useIsScratchpadOpen()` caller adds one, and
// `setIsScratchpadOpen` calls every one to say the flag has changed.
const listeners = new Set<() => void>()

function emit(): void {
  for (const l of listeners) l()
}

/** Idempotent set + localStorage mirror + notify. */
export function setIsScratchpadOpen(val: boolean): void {
  if (val === isScratchpadOpen) return
  isScratchpadOpen = val
  writeStored('local', KEY, val ? '1' : '0')
  emit()
}

/** Whether the scratchpad is open, without subscribing. In the app, read it
 *  with `useIsScratchpadOpen()`, which calls this; tests call it directly where
 *  there is no component to render. */
export function getIsScratchpadOpen(): boolean {
  return isScratchpadOpen
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener)
  return () => {
    listeners.delete(listener)
  }
}

export function useIsScratchpadOpen(): boolean {
  return useSyncExternalStore(subscribe, getIsScratchpadOpen, getIsScratchpadOpen)
}
