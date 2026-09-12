// cs-audited-page-header

import type { CSSProperties } from 'react'
import { setChatOpen, useChatOpen } from '../chat/chatOpenStore'
import { PageHeaderButton } from './PageHeaderButton'
import { IconChat } from '../icons/icons'
import { useChatUnread } from '../chat/chatUnread'
import { useAppAction } from '../actions/useBoundAction'
import { nameWithKey } from '../actions/nameWithKey'
import styles from './ChatButton.module.css'

/**
 * The chat-panel toggle in the club + game headers. Click toggles the
 * panel via the shared chatOpenStore — both this bubble and the
 * `<Chat>` panel subscribe to the store.
 *
 * **Unread indicator.** When the panel is closed and there are unread
 * messages (`chat/chatUnread.ts`), the speech bubble GLYPH fills with the
 * latest unread sender's profile color, and a count pill sits at the
 * top-left. Both clear the moment the panel opens (presumed read).
 *
 * Stays in place when the panel opens, per docs/ui.md →
 * "Layout stability." The bubble's position in the header is
 * fixed; the panel pops open / closes elsewhere.
 *
 * **It shows the key but does not fire it.** `/` is its own command — reach
 * chat, and stay there if you are already in it — while this mark TOGGLES, so
 * clicking it is how you close the panel. Two behaviors, deliberately; the
 * bubble reads the chord off the action so it can't drift from the binding.
 */
export function ChatButton() {
  const open = useChatOpen()
  const { count, color } = useChatUnread()
  const showBadge = !open && count > 0
  const actOpenChat = useAppAction('act-open-chat')
  return (
    <PageHeaderButton
      icon={IconChat}
      iconSize={22}
      label="Chat"
      tooltip={actOpenChat ? nameWithKey('Chat', actOpenChat) : 'Chat'}
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
