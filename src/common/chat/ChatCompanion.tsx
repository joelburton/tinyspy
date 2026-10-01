// cs-unmet

import { Companion } from '../floating-panels/Companion'
import type { Member } from '../members/member'
import { ChatBody } from './ChatBody'
import { setIsChatPanelOpen } from './chatPanelOpenStore'
import type { ClubMessage } from './useClubChat'

type Props = {
  clubHandle: string
  members: Member[]
  // The club's messages, from `ChatHost`'s subscription.
  messages: ClubMessage[]
  loading: boolean
}

/**
 * The open chat panel: a `<Companion>` holding the transcript and the composer.
 * `ChatHost` renders it while the panel is open; its ✕ closes the panel for
 * every page, through `chatPanelOpenStore`.
 */
export function ChatCompanion({ clubHandle, members, messages, loading }: Props) {
  return (
    <Companion
      title="Chat"
      onClose={() => setIsChatPanelOpen(false)}
      persistKey="puzpuzpuz:chat:rect"
      zIndex="var(--z-chat)"
      // Paints above every modal but ranks at its family for Escape, so Escape
      // with a setup dialog open closes the dialog, not the conversation.
      escapeRank="family"
      defaultPosition="center"
      defaultSize={{ width: 340, height: 460 }}
      minWidth={260}
      minHeight={240}
      // On a phone, keeps the composer and the newest messages above the
      // on-screen keyboard.
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
