import { useEffect, useState } from 'react'
import { FloatingPanel } from './FloatingPanel'
import { ChatBody } from './ChatBody'
import styles from './FloatingChat.module.css'

/** Match ChatBody's Member shape. */
type Member = {
  user_id: string
  username: string
  color: string
}

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
 * Closing is intentionally explicit: only the header X button
 * closes the panel. ESC does NOT close it (`closeOnEsc=false`),
 * and there's no backdrop click semantics because there's no
 * backdrop. The chat is always reachable; dismissing it should
 * be a conscious gesture.
 *
 * Why z-index 10000: the four modals refactored onto
 * <FloatingPanel> render at the default 500 tier. Chat needs to
 * sit above them so the "ask the partner what timer to pick"
 * use case works while SetupGameDialog is open. The Setup
 * backdrop sits at zIndex-1 (499); chat at 10000 is well above
 * that.
 *
 * Lifecycle: mounted once per page (ClubPage and GamePage each
 * render an instance). localStorage glue makes the open/closed
 * state and the rect continuous across remounts — there's a
 * brief moment during navigation where the chat unmounts and
 * remounts, but the persisted state restores immediately and
 * the user perceives a single continuous window.
 */
export function FloatingChat({ clubId, members }: Props) {
  const [open, setOpen] = useState<boolean>(() => readOpen())

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

  // Open shape — the floating panel. defaultPosition is
  // 'center' as a fallback for first-ever mount with no stored
  // rect; in practice the persisted rect lands the panel where
  // the user last left it. defaultSize matches the
  // ../connections initial size (~340x460).
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
      <ChatBody clubId={clubId} members={members} />
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
