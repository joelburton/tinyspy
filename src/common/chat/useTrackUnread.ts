// cs-unmet

import { useEffect } from 'react'
import { computeUnread, getChatLastSeen, setChatLastSeen } from './chatUnread'
import { setChatUnread } from './chatUnreadStore'
import type { ClubMessage } from './useClubChat'
import type { Member } from '../members/member'

type TrackUnreadOptions = {
  clubHandle: string
  messages: ClubMessage[]
  loading: boolean
  // The panel is open.
  isOpen: boolean
  members: Member[]
  // My own messages never count as unread.
  selfId: string
}

/**
 * Keeps the chat button's unread badge. While the panel is open, everything is
 * read: the club's bookmark moves to the newest message and the badge clears.
 * While it is closed, the badge shows the messages past the bookmark and the
 * latest sender's color.
 */
export function useTrackUnread({
  clubHandle,
  messages,
  loading,
  isOpen,
  members,
  selfId,
}: TrackUnreadOptions): void {
  useEffect(function trackUnread() {
    if (loading) return
    if (isOpen) {
      const newest = messages.at(-1)
      if (newest) setChatLastSeen(clubHandle, newest.sent_at)
      setChatUnread({ count: 0, senderColor: null })
      return
    }
    setChatUnread(
      computeUnread(messages, getChatLastSeen(clubHandle), selfId, members)
    )
  }, [messages, isOpen, loading, selfId, members, clubHandle])
}
