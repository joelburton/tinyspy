// cs-blessed-chat

import { useEffect } from 'react'
import { useClubChat } from './useClubChat'
import { registerChatHost } from './chatHostStore'
import { useIsChatPanelOpen } from './chatPanelOpenStore'
import { ChatCompanion } from './ChatCompanion'
import { useChatFeedback } from './useChatFeedback'
import { useOpenOnImportantMessage } from './useOpenOnImportantMessage'
import { useTrackUnread } from './useTrackUnread'

import type { FeedbackSlot } from '../feedback/feedbackSlotStore'
import type { Member } from '../members/member'

type Props = {
  clubHandle: string
  members: Member[]
  // The viewing member — their own messages never count as unread.
  myId: string
  // The page's global slot, where a new message from another member pops as a
  // pill whether the panel is open or closed.
  globalFeedbackSlot: FeedbackSlot
}

/**
 * The club's chat, mounted once per page (ClubPage and GamePage each render
 * one) and left mounted while closed, because it holds the club's one chat
 * subscription and three things read it while the panel is shut: the feedback
 * pill (`useChatFeedback`), the `!` opener (`useOpenOnImportantMessage`) and
 * the unread badge (`useTrackUnread`). Closed, it renders nothing; open, it
 * renders `<ChatCompanion>`. The whole shape: doc.md → Intro to area.
 */
export function ChatHost({
  clubHandle,
  members,
  myId,
  globalFeedbackSlot,
}: Props) {
  // In a store, so the header's button can flip it from outside this tree.
  const isOpen = useIsChatPanelOpen()
  // Count this `<ChatHost>` as a chat host for as long as it is mounted; see
  // `chatHostStore`.
  useEffect(registerChatHost, [])
  // Subscribed here, not in ChatBody, so the hooks below run while closed.
  const { messages, loading } = useClubChat(clubHandle)

  // A new message from another member also pops in the page's global slot.
  useChatFeedback({ messages, loading, members, myId, globalFeedbackSlot })

  useOpenOnImportantMessage({ messages, loading })
  useTrackUnread({ clubHandle, messages, loading, isOpen, members, myId })

  if (!isOpen) return null
  return (
    <ChatCompanion
      clubHandle={clubHandle}
      members={members}
      messages={messages}
      loading={loading}
    />
  )
}
