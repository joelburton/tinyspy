// cs-unmet

import { useEffect, useRef } from 'react'
import { useClubChat } from '../../hooks/chat/useClubChat'
import { setChatOpen, useChatOpen } from '../../lib/chat/chatOpenStore'
import {
  computeUnread,
  getChatLastSeen,
  setChatLastSeen,
  setChatUnread,
} from '../../lib/chat/chatUnread'
import { FloatingPanel } from '../floating-panels/FloatingPanel'
import { ChatBody } from './ChatBody'

import type { Member } from '../../lib/games'

type Props = {
  clubHandle: string
  members: Member[]
  /** The viewing member — their own messages never count as unread. */
  selfId: string
}

/**
 * The always-on chat panel. Renders as one of two shapes:
 *
 *   - **Closed**: nothing. What you click to open chat is the
 *     header's `<ChatButton>`, which is ordinary page content, not
 *     a layer — this component stays mounted to keep the unread
 *     badge and the `!` detector alive.
 *   - **Open**: a floating, draggable, resizable panel at
 *     `--z-index-chatPanel`. Position + size persist across
 *     club↔game navigation and across browser sessions via
 *     `useDraggablePanel`'s localStorage glue.
 *
 * Open/closed state ALSO persists (localStorage key
 * `puzpuzpuz:chat:open`) so the panel feels continuous as the
 * user moves between pages.
 *
 * **Force-open for important messages.** A message that starts
 * with `!` is treated as "everyone needs to see this" — chat
 * auto-opens for every recipient when one arrives. Use cases
 * include "shall we stop this game?", "I have to go in 5
 * minutes." The leading `!` is the trigger character; it's
 * NOT shown in the message list (ChatBody strips it for
 * display and bolds the content).
 *
 * Force-open semantics:
 *   - Subscribes to chat messages here (lifted from ChatBody)
 *     so the detector is alive even while the panel is closed.
 *   - First-load snapshots the current latest-message id
 *     WITHOUT opening — important messages already in the log
 *     when the user joins a session shouldn't auto-pop the
 *     panel on every navigation.
 *   - Any subsequent latest-id change that starts with `!`
 *     calls `setOpen(true)`. Users can close again immediately
 *     if they want; the next new `!` will reopen.
 *
 * Closing: the header X button, or Escape (FloatingPanel's default
 * `closeOnEsc`). There's no backdrop click semantics because there's
 * no backdrop. Escape fires whether or not focus is in the chat input
 * (it's a window-level listener); each open dismissible (chat, a help
 * modal, a popover) closes on its own Escape — we don't arbitrate a
 * single "topmost" dismiss, which is fine for the rare two-open case.
 *
 * Why chat outranks the panel tier: it needs to sit above the four
 * modals (Setup / HowToPlay / Hint / SuspendConfirm, all at
 * `--z-index-panel`) so the "ask the partner what timer to pick" use
 * case works while SetupGameDialog is open. Setup's backdrop paints
 * one below its own panel, so chat clears both.
 *
 * Lifecycle: mounted once per page (ClubPage and GamePage each
 * render an instance). localStorage glue makes the open/closed
 * state and the rect continuous across remounts.
 */
export function FloatingChat({
  clubHandle,
  members,
  selfId,
}: Props) {
  // Open/closed state lives in the shared chatOpenStore so the
  // GamePage header's `<ChatButton>` can flip the same flag from
  // outside this component tree. localStorage persistence is
  // owned by the store too — no per-instance mirror needed here.
  const open = useChatOpen()
  // useClubChat lifted from ChatBody so the force-open detector
  // runs even when the panel is closed. ChatBody now takes
  // messages + loading as props.
  const { messages, loading } = useClubChat(clubHandle)

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
  // latest-sender color for the messages past the bookmark (no
  // bookmark ⇒ the whole backlog). `<ChatButton>` reads the result.
  useEffect(function trackUnread() {
    if (loading) return
    const newest = messages.length > 0 ? messages[messages.length - 1] : null
    if (open) {
      if (newest) setChatLastSeen(clubHandle, newest.sent_at)
      setChatUnread({ count: 0, color: null })
      return
    }
    setChatUnread(
      computeUnread(messages, getChatLastSeen(clubHandle), selfId, members),
    )
  }, [messages, open, loading, selfId, members, clubHandle])

  // Closed shape — nothing. The affordance that opens chat is the
  // header's `<ChatButton>`, on both pages that mount this; it flips
  // the same shared flag from outside this component tree. The
  // effects above still run while closed, which is the point of
  // rendering null rather than not mounting: the unread badge and
  // the `!` force-open detector need the subscription alive.
  if (!open) return null

  // Open shape — the floating panel.
  return (
    <FloatingPanel
      family="companion"
      title="Chat"
      onClose={() => setChatOpen(false)}
      persistKey="puzpuzpuz:chat:rect"
      zIndex="var(--z-index-chatPanel)"
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
    </FloatingPanel>
  )
}

