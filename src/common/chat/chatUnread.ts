// cs-blessed-chat

import type { Member } from '../members/member'
import { memberById } from '../members/memberList'
import type { ClubMessage } from './useClubChat'
import { readStored, writeStored } from '../web-storage/storage'
import type { ChatUnread } from './chatUnreadStore'

/**
 * Working out what is unread, for the chat mark's badge. `<ChatHost>` calls
 * `computeUnread` with its messages and publishes the answer to
 * `chatUnreadStore`, which `<ChatButton>` reads.
 *
 * "Unread" = messages not sent by me, with `sent_at` newer than my per-club
 * last-seen bookmark — and **with no bookmark, EVERYTHING counts**, so a
 * member who's never opened this club's chat (or cleared their storage) lights
 * up with the full backlog. Opening the panel advances the bookmark to the
 * newest message (presumed read). The bookmark lives in localStorage so it
 * survives reloads and reflects messages that arrived while the member was
 * away.
 */

// ─── per-club last-seen bookmark (localStorage) ─────────────────────
function lastSeenKey(clubHandle: string): string {
  return `puzpuzpuz:chat:lastSeen:${clubHandle}`
}

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
  myId: string,
  members: Member[],
): ChatUnread {
  const unread = messages.filter(
    (m) => m.user_id !== myId && (!lastSeen || m.sent_at > lastSeen),
  )
  if (unread.length === 0) return { count: 0, senderColor: null }
  const latest = unread[unread.length - 1]
  const member = memberById(members, latest.user_id)
  // A sender the roster does not name publishes as null, which is an ordinary
  // page load and not only a genuinely unresolvable member: the roster arrives
  // a beat after the messages do.
  return { count: unread.length, senderColor: member?.color ?? null }
}
