// cs-fixed-chat

import { useSyncExternalStore } from 'react'

/**
 * Whether this page has a chat host: a mounted `<Chat>`, open or closed.
 * `<Chat>` registers itself with `registerChatHost()`; readers use
 * `useHasChatHost()`.
 */

function hasChatHost(): boolean {
  return chatHostCount > 0
}

// A COUNT, not a flag: a page swap can mount the next page's `<Chat>` before
// the last page's has released, and a flag would be cleared by the release
// that comes second.
let chatHostCount = 0
// A listener is a callback, not a person: each `useHasChatHost()` caller adds
// one to the set, and `registerChatHost` and its release call every one to say
// `chatHostCount` has changed.
const listeners = new Set<() => void>()

function subscribe(listener: () => void): () => void {
  listeners.add(listener)
  return () => {
    listeners.delete(listener)
  }
}

/** Count one more chat host, and return the release. `<Chat>` calls it from
 *  an effect, so the count follows each `<Chat>`'s own lifetime. */
export function registerChatHost(): () => void {
  chatHostCount += 1
  for (const listener of listeners) listener()
  return () => {
    chatHostCount -= 1
    for (const listener of listeners) listener()
  }
}

/** Whether any chat host is mounted: true on a page that renders `<Chat>` —
 *  the club page and the game page — whether its panel is open or closed, and
 *  false everywhere else. */
export function useHasChatHost(): boolean {
  return useSyncExternalStore(subscribe, hasChatHost)
}
