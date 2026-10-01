// cs-blessed-chat

import { useShowPeerFeedback } from '../feedback/useShowPeerFeedback'
import { FeedbackMessage } from '../feedback/FeedbackMessage'
import type { FeedbackSlot } from '../feedback/feedbackSlotStore'
import { memberById } from '../members/memberList'
import type { ClubMessage } from './useClubChat'
import type { Member } from '../members/member'

/** Longest chat text shown in the pill before it's clipped. The global slot
 *  is a small header element and this repo forbids header reflow (docs/ui.md
 *  → Layout stability), so a long message (chat allows up to 1000 chars) is
 *  truncated rather than allowed to grow the slot. */
const MAX_PILL_CHARS = 80

type ChatFeedbackOptions = {
  // The club's chat log and its load flag, as `useClubChat` returns them.
  messages: ClubMessage[]
  loading: boolean
  members: Member[]
  selfId: string
  globalFeedbackSlot: FeedbackSlot
}

/**
 * Bridges club chat to the GLOBAL feedback slot: every NEW message from
 * another member shows as "● HANDLE: text" (the `chat` kind). Takes the stream
 * rather than opening one, so `<Chat>` — which already holds it for the unread
 * badge and the `!` detector — is the only caller. `members` is the FULL club
 * roster, so a sender outside the current game is still named; `selfId` is the
 * viewer, whose own messages never pop.
 *
 * Messages already in the log at load never pop: `useShowPeerFeedback` seeds
 * them as seen on the first loaded render, which is why `enabled` waits on the
 * stream's `loading`.
 */
export function useChatFeedback({
  messages,
  loading,
  members,
  selfId,
  globalFeedbackSlot,
}: ChatFeedbackOptions): void {
  useShowPeerFeedback({
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
      const isImportant = m.content.startsWith('!')
      const body = isImportant ? m.content.slice(1).trimStart() : m.content
      const text = body.length > MAX_PILL_CHARS ? `${body.slice(0, MAX_PILL_CHARS)}…` : body
      return FeedbackMessage.chat(member, text)
    },
    globalFeedbackSlot,
  })
}
