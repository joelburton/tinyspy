// cs-unmet

import type { CSSProperties } from 'react'
import { cls } from '../../lib/util/cls'
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
 * messages (see lib/chatUnread), the speech bubble GLYPH fills with the
 * latest unread sender's profile color, and a count pill sits at the
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
      className={cls('bare-icon-button', styles.bubble)}
      aria-pressed={open}
      onClick={() => setChatOpen(!open)}
      aria-label={
        open
          ? 'Close chat'
          : showBadge
            ? `Open chat, ${count} unread`
            : 'Open chat'
      }
      title="Chat"
      // The GLYPH fills with the latest unread sender's color (see the module);
      // the button's own background is left to hover and press. No unread, no
      // property, and the bubble stays hollow.
      style={showBadge && color ? ({ '--chat-unread-color': color } as CSSProperties) : undefined}
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

