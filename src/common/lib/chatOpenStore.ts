import { useSyncExternalStore } from 'react'

/**
 * Shared open/closed state for the FloatingChat panel.
 *
 * The chat toggle now lives in two distinct UI surfaces:
 *
 *   - The bottom-right circular button on ClubPage (still owned
 *     by `<FloatingChat>` in its "closed" branch).
 *   - The `<ChatBubble>` in the GamePage header.
 *
 * Both need to flip the same flag, and `<FloatingChat>` needs to
 * read it to decide whether to render the panel. The previous
 * "each instance reads/writes localStorage on its own" pattern
 * doesn't propagate within a single tab — clicking the header
 * bubble wouldn't tell the bottom-right button (or vice versa)
 * without a page reload.
 *
 * So we lift the state out of the component tree into a small
 * pub-sub store. Subscribers use `useChatOpen()` (which wraps
 * `useSyncExternalStore`); writers call `setChatOpen(next)`.
 *
 * localStorage is still mirrored on write — that's how the open
 * state persists across club ↔ game navigation (each page mounts
 * a fresh tree but the store re-initializes from localStorage at
 * module load).
 */

const KEY = 'pupgames:chat:open'

function readInitial(): boolean {
  try {
    return window.localStorage.getItem(KEY) === 'true'
  } catch {
    return false
  }
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

/** Read-only accessor for code that needs the current value but
 *  doesn't want to subscribe (e.g. inside a click handler). */
export function getChatOpen(): boolean {
  return value
}

/** Write the open/closed state. Idempotent — a same-value write
 *  is a no-op (no notify, no localStorage round-trip). */
export function setChatOpen(next: boolean): void {
  if (value === next) return
  value = next
  try {
    window.localStorage.setItem(KEY, next ? 'true' : 'false')
  } catch {
    // ignore — same posture as useDraggablePanel's storage glue
  }
  for (const listener of listeners) listener()
}

/** Subscribe to the open/closed state. Re-renders the caller when
 *  the value flips. Use in any component that needs to react to
 *  chat-open changes (the header bubble's aria-label, the panel
 *  body's render gating, etc.). */
export function useChatOpen(): boolean {
  return useSyncExternalStore(subscribe, getSnapshot)
}
