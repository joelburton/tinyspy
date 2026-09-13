// cs-audited-chat

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
 * Bridges club chat to the GLOBAL feedback slot: every NEW message from
 * another member shows as "● HANDLE: text" (the `chat` kind). Call it wherever
 * the global slot lives — ClubPage and GamePage — with the FULL club roster,
 * so a sender outside the current game is still named; `selfId` is the viewer,
 * whose own messages never pop.
 *
 * Messages already in the log at load never pop: `usePeerFeedback` seeds them
 * as seen on the first loaded render, which is why `enabled` waits on the
 * stream's `loading`.
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
