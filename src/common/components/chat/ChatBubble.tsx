import { setChatOpen, useChatOpen } from '../../lib/chat/chatOpenStore'
import { useChatUnread } from '../../lib/chat/chatUnread'
import styles from './ChatBubble.module.css'

/**
 * The chat-panel toggle in the club + game headers. Click toggles the
 * panel via the shared chatOpenStore — both this bubble and the
 * `<FloatingChat>` panel subscribe to the store.
 *
 * **Unread indicator.** When the panel is closed and there are unread
 * messages (see lib/chatUnread), the bubble fills with the latest
 * unread sender's profile color and shows a red count pill at the
 * top-left. Both clear the moment the panel opens (presumed read).
 *
 * Stays in place when the panel opens, per docs/ui.md →
 * "Layout stability." The bubble's position in the header is
 * fixed; the panel pops open / closes elsewhere.
 */
export function ChatBubble() {
  const open = useChatOpen()
  const { count, color } = useChatUnread()
  const showBadge = !open && count > 0
  return (
    <button
      type="button"
      className={styles.bubble}
      onClick={() => setChatOpen(!open)}
      aria-label={
        open
          ? 'Close chat'
          : showBadge
            ? `Open chat, ${count} unread`
            : 'Open chat'
      }
      title="Chat"
      // Fill with the latest unread sender's color; a white icon reads
      // on top of it. No unread → the default (unfilled) bubble.
      style={showBadge && color ? { background: color, color: '#fff' } : undefined}
    >
      <ChatBubbleIcon />
      {showBadge && (
        <span className={styles.unreadPill} aria-hidden>
          {count}
        </span>
      )}
    </button>
  )
}

/** Inline SVG chat-bubble. Same path as `<FloatingChat>`'s closed-
 *  button icon — a Unicode glyph (💬) varies in rendering across
 *  OSes; a hand-rolled SVG reads consistently and respects
 *  currentColor. */
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
