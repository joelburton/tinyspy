import { useEffect, useRef, useState } from 'react'
import { useClubChat } from '../hooks/useClubChat'
import { FloatingPanel } from './FloatingPanel'
import { ChatBody } from './ChatBody'
import styles from './FloatingChat.module.css'

import type { Member } from '../lib/games'

type Props = {
  clubId: string
  members: Member[]
}

/**
 * The always-on chat companion. Renders as one of two shapes:
 *
 *   - **Closed**: a small circular chat-bubble button in the
 *     bottom-right corner. Click to open.
 *   - **Open**: a floating, draggable, resizable panel above
 *     every other UI layer (z-index 10000). Position + size
 *     persist across club↔game navigation and across browser
 *     sessions via `useDraggablePanel`'s localStorage glue.
 *
 * Open/closed state ALSO persists (localStorage key
 * `pupgames:chat:open`) so the panel feels continuous as the
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
 * Closing is intentionally explicit: only the header X button
 * closes the panel. ESC does NOT close it (`closeOnEsc=false`),
 * and there's no backdrop click semantics because there's no
 * backdrop.
 *
 * Why z-index 10000: chat needs to sit above the four modals
 * (Setup / HowToPlay / Hint / SuspendConfirm at z-index 500) so
 * the "ask the partner what timer to pick" use case works while
 * SetupGameDialog is open. The Setup backdrop sits at zIndex-1
 * (499); chat at 10000 is well above that.
 *
 * Lifecycle: mounted once per page (ClubPage and GamePage each
 * render an instance). localStorage glue makes the open/closed
 * state and the rect continuous across remounts.
 */
export function FloatingChat({ clubId, members }: Props) {
  const [open, setOpen] = useState<boolean>(() => readOpen())
  // useClubChat lifted from ChatBody so the force-open detector
  // runs even when the panel is closed. ChatBody now takes
  // messages + loading as props.
  const { messages, loading } = useClubChat(clubId)

  // Force-open detector. Track the latest-seen message id across
  // renders; on first-load (right after the initial fetch
  // resolves) snapshot the current latest WITHOUT acting, so
  // older `!` messages already in the log don't pop the panel
  // every time a user navigates in.
  const lastSeenIdRef = useRef<string | null>(null)
  const initializedRef = useRef(false)
  useEffect(() => {
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
      // React 19's stricter "set-state-in-effect" rule flags
      // this — but the setState IS in direct response to an
      // external event (a new message arrived via Realtime
      // through useClubChat). The cascading render warning the
      // rule guards against doesn't apply here: open is the
      // only state we touch, and only when the latest-message
      // id genuinely changed.
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setOpen(true)
    }
  }, [messages, loading])

  // Mirror open state to localStorage so the next mount (after
  // navigation or reload) restores it.
  useEffect(() => {
    writeOpen(open)
  }, [open])

  // Closed shape — the bottom-right toggle button.
  if (!open) {
    return (
      <button
        type="button"
        className={styles.openButton}
        onClick={() => setOpen(true)}
        aria-label="Open chat"
        title="Chat"
      >
        <ChatBubbleIcon />
      </button>
    )
  }

  // Open shape — the floating panel.
  return (
    <FloatingPanel
      title="Chat"
      onClose={() => setOpen(false)}
      closeOnEsc={false}
      persistKey="pupgames:chat:rect"
      zIndex={10000}
      defaultPosition="center"
      defaultSize={{ width: 340, height: 460 }}
      minWidth={260}
      minHeight={240}
    >
      <ChatBody
        clubId={clubId}
        members={members}
        messages={messages}
        loading={loading}
      />
    </FloatingPanel>
  )
}

const OPEN_KEY = 'pupgames:chat:open'

function readOpen(): boolean {
  try {
    return window.localStorage.getItem(OPEN_KEY) === 'true'
  } catch {
    return false
  }
}

function writeOpen(value: boolean): void {
  try {
    window.localStorage.setItem(OPEN_KEY, value ? 'true' : 'false')
  } catch {
    // ignore — see useDraggablePanel for the same posture
  }
}

/** Inline SVG chat-bubble. A Unicode glyph (💬) varies in
 *  rendering across OSes; a hand-rolled SVG reads consistently
 *  and respects currentColor. */
function ChatBubbleIcon() {
  return (
    <svg
      width="22"
      height="22"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.38 8.38 0 0 1 3.8-.9h.5a8.48 8.48 0 0 1 8 8v.5z" />
    </svg>
  )
}
