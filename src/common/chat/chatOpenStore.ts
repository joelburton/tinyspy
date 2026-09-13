// cs-audited-chat

import { useSyncExternalStore } from 'react'
import { readStored, writeStored } from '../web-storage/storage'

/**
 * Shared open/closed state for the Chat panel.
 *
 * Three things flip it — the header's `<ChatButton>` (on the club page and the
 * game page), the `act-open-chat` key bound at the app root, and the panel's
 * own close — and `<Chat>` reads it to decide whether to render the panel at
 * all (it renders nothing while closed). They sit in different subtrees, so
 * the state lives outside the component tree in a small pub-sub store.
 * Subscribers use `useChatOpen()` (which wraps `useSyncExternalStore`);
 * writers call `setChatOpen(next)`.
 *
 * localStorage is still mirrored on write — that's how the open
 * state persists across club ↔ game navigation (each page mounts
 * a fresh tree but the store re-initializes from localStorage at
 * module load).
 */

const KEY = 'puzpuzpuz:chat:open'

function readInitial(): boolean {
  // No storage means closed, same as never having opened it.
  return readStored('local', KEY, null) === 'true'
}

let value = readInitial()
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

/** The current value without subscribing. This is a seam for TESTS, which need
 *  the flag where there is no component to render — a store's own test, or one
 *  whose subject is a keystroke. In the app, read it with `useChatOpen()`. */
export function getChatOpen(): boolean {
  return value
}

/** Write the open/closed state. Idempotent — a same-value write
 *  is a no-op (no notify, no localStorage round-trip). */
export function setChatOpen(next: boolean): void {
  if (value === next) return
  value = next
  writeStored('local', KEY, next ? 'true' : 'false')
  for (const listener of listeners) listener()
}

/** Subscribe to the open/closed state. Re-renders the caller when the value
 *  flips — the header bubble's pressed state, the panel's own render gate. */
export function useChatOpen(): boolean {
  return useSyncExternalStore(subscribe, getSnapshot)
}

// A COUNT, not a flag: a page swap can mount the next page's chat panel before
// the last page's has released, and a flag would be cleared by the release
// that comes second.
let mountedPanels = 0
const mountedListeners = new Set<() => void>()

/** Say a chat panel is on screen, and return the release. `<Chat>` calls it
 *  from an effect, so the count follows each chat panel's own lifetime. */
export function registerChatMounted(): () => void {
  mountedPanels += 1
  for (const listener of mountedListeners) listener()
  return () => {
    mountedPanels -= 1
    for (const listener of mountedListeners) listener()
  }
}

/**
 * IS THERE A CHAT PANEL ON THIS PAGE AT ALL? `<Chat>` mounts on the club page
 * and the game page and nowhere else, so on the home page opening it would
 * flip a flag nothing renders. The `/` action reads this and is simply not
 * offered there — better than a key that appears to do nothing.
 */
export function useChatMounted(): boolean {
  return useSyncExternalStore(
    (listener) => {
      mountedListeners.add(listener)
      return () => {
        mountedListeners.delete(listener)
      }
    },
    () => mountedPanels > 0,
  )
}
