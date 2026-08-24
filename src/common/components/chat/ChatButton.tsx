// cs-unmet

import type { CSSProperties } from 'react'
import { setChatOpen, useChatOpen } from '../../lib/chat/chatOpenStore'
import { PageHeaderButton } from '../chrome/PageHeaderButton'
import { IconChat } from '../icons'
import { useChatUnread } from '../../lib/chat/chatUnread'
import styles from './ChatButton.module.css'

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
export function ChatButton() {
  const open = useChatOpen()
  const { count, color } = useChatUnread()
  const showBadge = !open && count > 0
  return (
    <PageHeaderButton
      icon={IconChat}
      iconSize={22}
      label={
        open ? 'Close chat' : showBadge ? `Open chat, ${count} unread` : 'Open chat'
      }
      tooltip="Chat"
      aria-pressed={open}
      onClick={() => setChatOpen(!open)}
      className={styles.bubble}
      // The GLYPH fills with the latest unread sender's color (see the module);
      // the button's own background is left to hover and press. No unread, no
      // property, and the bubble stays hollow.
      style={showBadge && color ? ({ '--chat-unread-color': color } as CSSProperties) : undefined}
      badge={
        showBadge && (
          <span className={styles.unreadPill} aria-hidden>
            {count}
          </span>
        )
      }
    />
  )
}

