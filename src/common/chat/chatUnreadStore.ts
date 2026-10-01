// cs-fixed-chat

import { useSyncExternalStore } from 'react'

/**
 * What the header's chat mark shows: how many messages are unread, and which
 * palette color the latest unread sender wears. `<Chat>` holds the message
 * stream, so it works the answer out (`computeUnread`, in `chatUnread.ts`) and
 * publishes it here; `<ChatButton>`, a sibling in the header rather than in
 * Chat's tree, reads it and decides what the mark looks like. It is published
 * as two facts because resolving a `user_id` needs the club roster, which only
 * Chat's side has.
 */

export type ChatUnread = {
  count: number
  // The latest unread sender's profile-color NAME ('blue'), as the member row
  // carries it — not a CSS value. Null when there is nothing unread, and also
  // when the sender is not in the roster we were given; `<ChatButton>` decides
  // what each of those looks like.
  senderColor: string | null
}

let chatUnreadInfo: ChatUnread = { count: 0, senderColor: null }
// A listener is a callback: each `useChatUnread()` caller adds one, and
// `setChatUnread` calls every one to say `chatUnreadInfo` has changed.
const listeners = new Set<() => void>()

function subscribe(listener: () => void): () => void {
  listeners.add(listener)
  return () => {
    listeners.delete(listener)
  }
}

function getChatUnreadInfo(): ChatUnread {
  return chatUnreadInfo
}

/** Publish the current unread state. Idempotent — a same-value write
 *  is a no-op (keeps the snapshot reference stable for
 *  useSyncExternalStore). */
export function setChatUnread(val: ChatUnread): void {
  if (
    val.count === chatUnreadInfo.count
    && val.senderColor === chatUnreadInfo.senderColor
  ) return
  chatUnreadInfo = val
  for (const listener of listeners) listener()
}

/** Subscribe to the unread state — `<ChatButton>` is the reader. */
export function useChatUnread(): ChatUnread {
  return useSyncExternalStore(subscribe, getChatUnreadInfo)
}
