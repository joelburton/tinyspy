// cs-audited-chat

import { useEffect, useRef } from 'react'
import { useClubChat } from './useClubChat'
import { registerChatMounted, setChatOpen, useChatOpen } from './chatOpenStore'
import {
  computeUnread,
  getChatLastSeen,
  setChatLastSeen,
  setChatUnread,
} from './chatUnread'
import { Companion } from '../floating-panels/Companion'
import { ChatBody } from './ChatBody'
import { useChatFeedback } from './useChatFeedback'

import type { FeedbackSlot } from '../feedback/feedbackSlotStore'
import type { Member } from '../members/member'

type Props = {
  clubHandle: string
  members: Member[]
  // The viewing member — their own messages never count as unread.
  selfId: string
  // The page's global slot, where a new message from another member pops as a
  // pill whether the panel is open or closed.
  globalFeedbackSlot: FeedbackSlot
}

/**
 * The club chat panel. Mounted once per page (ClubPage and GamePage each
 * render one) and left mounted while closed, because it holds the club's ONE
 * chat subscription and three things read that stream while the panel is
 * shut: the unread badge, the global feedback pill (`useChatFeedback`) and the
 * `!` force-open detector. Closed, it renders nothing; the header's
 * `<ChatButton>` and the `/` action flip the shared `chatOpenStore`. Open, it
 * is a `<Companion>` at `--z-chat`, above every dim, with its rect and its
 * open state persisted across pages.
 *
 * A message that starts with `!` opens the panel for every recipient when it
 * arrives — not for one already in the log at load — and `<ChatBody>` strips
 * the marker for display. The whole shape: doc.md → Design.
 */
export function Chat({
  clubHandle,
  members,
  selfId,
  globalFeedbackSlot,
}: Props) {
  // Open/closed state is the shared chatOpenStore's, so the header's
  // `<ChatButton>` can flip the same flag from outside this tree.
  const open = useChatOpen()
  // Say chat is HERE for as long as this is mounted, so the `/` action can be
  // offered on the pages that have a chat panel and left unbound on the one
  // that doesn't. See the store.
  useEffect(registerChatMounted, [])
  // The stream is subscribed HERE rather than in ChatBody, so the force-open
  // detector and the unread badge below run while the panel is closed.
  const { messages, loading } = useClubChat(clubHandle)

  // A new message from another member also pops in the page's global slot.
  useChatFeedback({ messages, loading, members, selfId, globalFeedbackSlot })

  // Force-open detector. Track the latest-seen message id across
  // renders; on first-load (right after the initial fetch
  // resolves) snapshot the current latest WITHOUT acting, so
  // older `!` messages already in the log don't pop the panel
  // every time a user navigates in.
  const lastSeenIdRef = useRef<string | null>(null)
  const initializedRef = useRef(false)
  useEffect(function autoOpenOnImportantMessage() {
    // Wait for the initial fetch to resolve so we have a stable
    // starting snapshot. While loading, neither initialize nor
    // act.
    if (loading) return
    if (messages.length === 0) {
      initializedRef.current = true
      return
    }
    const latest = messages[messages.length - 1]
    if (!initializedRef.current) {
      // First successful load — record the current latest id
      // as "already seen" so we don't auto-open for it. Any
      // message that arrives AFTER this point is fair game.
      lastSeenIdRef.current = latest.id
      initializedRef.current = true
      return
    }
    if (latest.id === lastSeenIdRef.current) return
    lastSeenIdRef.current = latest.id
    if (latest.content.startsWith('!')) {
      setChatOpen(true)
    }
  }, [messages, loading])

  // Unread badge. While the panel is OPEN, everything in the log is
  // presumed read — advance the per-club bookmark to the newest
  // message and clear the badge. While CLOSED, publish the count +
  // the latest sender's color name for the messages past the bookmark
  // (no bookmark ⇒ the whole backlog). `<ChatButton>` draws the result.
  useEffect(function trackUnread() {
    if (loading) return
    const newest = messages.length > 0 ? messages[messages.length - 1] : null
    if (open) {
      if (newest) setChatLastSeen(clubHandle, newest.sent_at)
      setChatUnread({ count: 0, senderColor: null })
      return
    }
    setChatUnread(
      computeUnread(messages, getChatLastSeen(clubHandle), selfId, members),
    )
  }, [messages, open, loading, selfId, members, clubHandle])

  // Closed shape — nothing, with the effects above still running: that is
  // why this renders null rather than being unmounted (see the docstring).
  if (!open) return null

  // Open shape — the floating panel.
  return (
    <Companion
      title="Chat"
      onClose={() => setChatOpen(false)}
      persistKey="puzpuzpuz:chat:rect"
      zIndex="var(--z-chat)"
      // Paints above every modal, RANKS at its family — see the prop. Without
      // this, Escape with a setup dialog open would close the conversation
      // rather than the form.
      escapeRank="family"
      defaultPosition="center"
      defaultSize={{ width: 340, height: 460 }}
      minWidth={260}
      minHeight={240}
      // On a phone the chat sheet reserves keyboard space at the bottom so the
      // input + newest messages stay above the on-screen keyboard (read-reply +
      // type is chat's whole loop) — with no reflow when it toggles.
      reserveKeyboard
    >
      <ChatBody
        clubHandle={clubHandle}
        members={members}
        messages={messages}
        loading={loading}
      />
    </Companion>
  )
}

