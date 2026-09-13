// cs-audited-chat

import { useSyncExternalStore } from 'react'
import type { Member } from '../members/member'
import { memberById } from '../members/memberList'
import type { ClubMessage } from './useClubChat'
import { readStored, writeStored } from '../web-storage/storage'

/**
 * The chat-unread indicator's shared state + logic.
 *
 * `<Chat>` holds the message stream and reads the open/closed state, so it
 * computes "unread" and publishes it here; `<ChatButton>` (a sibling in the header, not
 * in Chat's tree) reads it and decides what the mark looks like. What is
 * published is two facts — how many, and which palette color the latest unread
 * sender wears — because resolving a `user_id` needs the club roster, which
 * only this side has. Same lifted-state shape as `chatOpenStore`.
 *
 * "Unread" = messages not sent by me, with `sent_at` newer than my per-club
 * last-seen bookmark — and **with no bookmark, EVERYTHING counts**, so a
 * member who's never opened this club's chat (or cleared their storage) lights
 * up with the full backlog. Opening the panel advances the bookmark to the
 * newest message (presumed read). The bookmark lives in localStorage so it
 * survives reloads and reflects messages that arrived while the member was
 * away.
 */

export type ChatUnread = {
  count: number
  // The latest unread sender's profile-color NAME ('blue'), as the member row
  // carries it — not a CSS value. Null when there is nothing unread, and also
  // when the sender is not in the roster we were given; `<ChatButton>` decides
  // what each of those looks like.
  senderColor: string | null
}

const NONE: ChatUnread = { count: 0, senderColor: null }

// ─── the pub-sub store (publish from Chat, read by ChatButton) ──
let value: ChatUnread = NONE
const listeners = new Set<() => void>()

function subscribe(listener: () => void): () => void {
  listeners.add(listener)
  return () => {
    listeners.delete(listener)
  }
}

function getSnapshot(): ChatUnread {
  return value
}

/** Publish the current unread state. Idempotent — a same-value write
 *  is a no-op (keeps the snapshot reference stable for
 *  useSyncExternalStore). */
export function setChatUnread(next: ChatUnread): void {
  if (next.count === value.count && next.senderColor === value.senderColor) return
  value = next
  for (const listener of listeners) listener()
}

/** Subscribe to the unread state — `<ChatButton>` is the reader. */
export function useChatUnread(): ChatUnread {
  return useSyncExternalStore(subscribe, getSnapshot)
}

// ─── per-club last-seen bookmark (localStorage) ─────────────────────
const lastSeenKey = (clubHandle: string) =>
  `puzpuzpuz:chat:lastSeen:${clubHandle}`

/** The `sent_at` of the newest message this member had seen, or null
 *  if they've never opened this club's chat. */
export function getChatLastSeen(clubHandle: string): string | null {
  // No storage reads as "never opened this club's chat" — everything shows
  // unread, which is the safe direction for a badge.
  return readStored('local', lastSeenKey(clubHandle), null)
}

export function setChatLastSeen(clubHandle: string, sentAt: string): void {
  writeStored('local', lastSeenKey(clubHandle), sentAt)
}

// ─── pure derivation (unit-tested) ──────────────────────────────────
/**
 * Compute the unread badge from the loaded messages.
 *
 * `sent_at` is an ISO-8601 string, so `>` is a correct chronological
 * compare. A null `lastSeen` means "seen nothing" → every message
 * that isn't mine is unread.
 */
export function computeUnread(
  messages: ClubMessage[],
  lastSeen: string | null,
  selfId: string,
  members: Member[],
): ChatUnread {
  const unread = messages.filter(
    (m) => m.user_id !== selfId && (!lastSeen || m.sent_at > lastSeen),
  )
  if (unread.length === 0) return NONE
  const latest = unread[unread.length - 1]
  const member = memberById(members, latest.user_id)
  // A sender the roster does not name publishes as null, which is an ordinary
  // page load and not only a genuinely unresolvable member: the roster arrives
  // a beat after the messages do.
  return { count: unread.length, senderColor: member?.color ?? null }
}
