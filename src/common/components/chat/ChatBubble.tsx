import { setChatOpen, useChatOpen } from '../../lib/chat/chatOpenStore'
import { IconChat } from '../icons'
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
      <IconChat size={22} />
      {showBadge && (
        <span className={styles.unreadPill} aria-hidden>
          {count}
        </span>
      )}
    </button>
  )
}

