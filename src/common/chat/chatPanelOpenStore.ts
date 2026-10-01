// cs-blessed-chat

import { useSyncExternalStore } from 'react'
import { readStored, writeStored } from '../web-storage/storage'

/**
 * Shared open/closed state for the Chat panel.
 *
 * Its writers sit in different subtrees — the header's `<ChatButton>`, the
 * `act-open-chat` key bound at the app root, and `<Chat>` itself, for its own
 * close and for the `!` force-open — and `<Chat>` reads it to decide whether
 * to render the panel at all (it renders nothing while closed). So the state
 * lives outside the component tree in a small pub-sub store. Subscribers use
 * `useIsChatPanelOpen()` (which wraps `useSyncExternalStore`); writers call
 * `setIsChatPanelOpen(val)`.
 *
 * The module holds the value for the life of the tab, so club ↔ game
 * navigation keeps it on its own; the localStorage mirror is what carries it
 * across a reload.
 */

const KEY = 'puzpuzpuz:chat:panel-open'

// Starts as it was left, from localStorage. No storage means closed, same as
// never having opened it.
let isChatPanelOpen = readStored('local', KEY, null) === 'true'
// A listener is a callback, not a person: each `useIsChatPanelOpen()` caller
// adds one to the set, and `setIsChatPanelOpen` calls every one to say
// `isChatPanelOpen` has changed.
const listeners = new Set<() => void>()

function subscribe(listener: () => void): () => void {
  listeners.add(listener)
  return () => {
    listeners.delete(listener)
  }
}

/** Whether the chat panel is open, without subscribing. In the app, read it
 *  with `useIsChatPanelOpen()`, which calls this; tests call it directly where
 *  there is no component to render — a store's own test, or one whose subject
 *  is a keystroke. */
export function getIsChatPanelOpen(): boolean {
  return isChatPanelOpen
}

/** Write the open/closed state. Idempotent — a same-value write
 *  is a no-op (no notify, no localStorage round-trip). */
export function setIsChatPanelOpen(val: boolean): void {
  if (isChatPanelOpen === val) return
  isChatPanelOpen = val
  writeStored('local', KEY, val ? 'true' : 'false')
  for (const listener of listeners) listener()
}

/** Subscribe to the open/closed state. Re-renders the caller when the value
 *  flips — the header bubble's pressed state, the panel's own render gate. */
export function useIsChatPanelOpen(): boolean {
  return useSyncExternalStore(subscribe, getIsChatPanelOpen)
}
