// cs-unmet

import { useClubChat } from './useClubChat'
import { usePeerFeedback } from '../feedback/usePeerFeedback'
import { FeedbackMessage } from '../feedback/FeedbackMessage'
import type { FeedbackSlot } from '../feedback/feedbackSlotStore'
import { memberById } from '../members/memberList'
import type { Member } from '../members/member'

/** Longest chat text shown in the pill before it's clipped. The global slot
 *  is a small header element and this repo forbids header reflow (docs/ui.md
 *  → Layout stability), so a long message (chat allows up to 1000 chars) is
 *  truncated rather than allowed to grow the slot. */
const MAX_PILL_CHARS = 80

/**
 * Bridges club chat → the GLOBAL feedback slot: every NEW chat message shows
 * a "● HANDLE: text" message (the `chat` kind: neutral, fades after 2s or
 * sooner if another header message replaces it) for every club member
 * EXCEPT the sender.
 *
 * Reuses the two hooks built for exactly this: `useClubChat` for the message
 * stream, and `usePeerFeedback` for the "fire on each NEW item, never replay
 * the backlog" bootstrap. **`enabled: !loading` is what makes the historical
 * case correct** — the machinery seeds the already-loaded history as "seen" on
 * the first loaded render, so signing in at 9:05 does NOT pop the 9:00/9:01
 * messages (they're only in the chat log); a message that arrives AFTER you're
 * connected pops. It keys off message `id`, so there's no clock/timestamp
 * reasoning, and the seed can't leak because `useClubChat` keeps `loading` true
 * until the real backlog is present (and the pages remount per club/game, so the
 * seen-set is always fresh for the current club — see App's route keying).
 *
 * `members` is the FULL club roster (not just a game's players) so a sender is
 * named even when they aren't in the current game. `selfId` is the viewer —
 * their own messages never pop. Call it wherever the global slot lives:
 * ClubPage and GamePage.
 */
export function useChatFeedback({
  clubHandle,
  members,
  selfId,
  globalFeedbackSlot,
}: {
  clubHandle: string
  members: Member[]
  selfId: string
  globalFeedbackSlot: FeedbackSlot
}): void {
  const { messages, loading } = useClubChat(clubHandle)

  usePeerFeedback({
    // Gate until the history has loaded so the seed captures the real backlog
    // (not an empty set that would replay everything on arrival).
    enabled: !loading,
    items: messages,
    keyOf: (m) => m.id,
    messageFor: (m) => {
      if (m.user_id === selfId) return null // my own message — never pop it back at me
      const member = memberById(members, m.user_id)
      // Mirror ChatBody: a leading '!' is the "force-open for everyone" marker,
      // not part of the shown text.
      const important = m.content.startsWith('!')
      const body = important ? m.content.slice(1).trimStart() : m.content
      const text = body.length > MAX_PILL_CHARS ? `${body.slice(0, MAX_PILL_CHARS)}…` : body
      return FeedbackMessage.chat(member, text)
    },
    globalFeedbackSlot,
  })
}
