import { useSyncExternalStore } from 'react'
import { colorVarFor } from '../color/memberColor'
import type { Member } from '../games'
import type { ClubMessage } from '../../hooks/chat/useClubChat'

/**
 * The chat-unread indicator's shared state + logic.
 *
 * `<FloatingChat>` owns the message stream + the open/closed state, so
 * it computes "unread" and publishes it here; `<ChatBubble>` (a
 * sibling in the header, not in FloatingChat's tree) reads it to fill
 * its background with the latest unread sender's color + show a red
 * count pill. Same lifted-state shape as `chatOpenStore`.
 *
 * "Unread" = messages not sent by me, with `sent_at` newer than my
 * per-club last-seen bookmark — and **with no bookmark, EVERYTHING
 * counts**, so a member who's never opened this club's chat (or
 * cleared their storage) lights up with the full backlog. Opening the
 * panel advances the bookmark to the newest message (presumed read).
 * The bookmark lives in localStorage so it survives reloads and
 * reflects messages that arrived while the member was away.
 */

export type ChatUnread = {
  count: number
  /** Latest unread sender's profile color (a CSS color string), or
   *  null when there's nothing unread. */
  color: string | null
}

const NONE: ChatUnread = { count: 0, color: null }

// ─── the pub-sub store (publish from FloatingChat, read by ChatBubble) ──
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
  if (next.count === value.count && next.color === value.color) return
  value = next
  for (const listener of listeners) listener()
}

export function useChatUnread(): ChatUnread {
  return useSyncExternalStore(subscribe, getSnapshot)
}

// ─── per-club last-seen bookmark (localStorage) ─────────────────────
const lastSeenKey = (clubHandle: string) =>
  `puzpuzpuz:chat:lastseen:${clubHandle}`

/** The `sent_at` of the newest message this member had seen, or null
 *  if they've never opened this club's chat. */
export function getChatLastSeen(clubHandle: string): string | null {
  try {
    return window.localStorage.getItem(lastSeenKey(clubHandle))
  } catch {
    return null
  }
}

export function setChatLastSeen(clubHandle: string, sentAt: string): void {
  try {
    window.localStorage.setItem(lastSeenKey(clubHandle), sentAt)
  } catch {
    // ignore — same posture as chatOpenStore's storage glue
  }
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
  selfUserId: string,
  members: Member[],
): ChatUnread {
  const unread = messages.filter(
    (m) => m.user_id !== selfUserId && (!lastSeen || m.sent_at > lastSeen),
  )
  if (unread.length === 0) return NONE
  const latest = unread[unread.length - 1]
  const member = members.find((mm) => mm.user_id === latest.user_id)
  return {
    count: unread.length,
    color: member ? colorVarFor(member.color) : 'var(--color-muted)',
  }
}
