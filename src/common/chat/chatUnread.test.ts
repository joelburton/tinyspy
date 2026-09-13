// cs-blessed-chat

import { describe, it, expect } from 'vitest'
import { computeUnread } from './chatUnread'
import type { ClubMessage } from './useClubChat'
import type { Member } from '../members/member'

const members = [
  { user_id: 'alice', username: 'alice', color: 'orange' },
  { user_id: 'bob', username: 'bob', color: 'blue' },
] as Member[]

function msg(user_id: string, sent_at: string, content = 'hi'): ClubMessage {
  return { id: `${user_id}-${sent_at}`, user_id, content, sent_at }
}

describe('computeUnread', () => {
  it('no messages → nothing unread', () => {
    expect(computeUnread([], null, 'alice', members)).toEqual({
      count: 0,
      senderColor: null,
    })
  })

  it('no lastSeen → every non-self message counts (the whole backlog)', () => {
    const messages = [
      msg('bob', '2026-01-01T00:00:01Z'),
      msg('bob', '2026-01-01T00:00:02Z'),
    ]
    expect(computeUnread(messages, null, 'alice', members)).toEqual({
      count: 2,
      senderColor: 'blue', // bob = latest unread sender
    })
  })

  it("excludes the viewer's own messages", () => {
    const messages = [
      msg('alice', '2026-01-01T00:00:01Z'), // mine
      msg('bob', '2026-01-01T00:00:02Z'),
    ]
    expect(computeUnread(messages, null, 'alice', members).count).toBe(1)
  })

  it('only counts messages newer than lastSeen', () => {
    const messages = [
      msg('bob', '2026-01-01T00:00:01Z'),
      msg('bob', '2026-01-01T00:00:02Z'),
      msg('bob', '2026-01-01T00:00:03Z'),
    ]
    expect(
      computeUnread(messages, '2026-01-01T00:00:01Z', 'alice', members).count,
    ).toBe(2)
  })

  it('the color is the LATEST unread sender (own messages do not shift it)', () => {
    const messages = [
      msg('bob', '2026-01-01T00:00:01Z'),
      msg('alice', '2026-01-01T00:00:02Z'), // mine — excluded
      msg('bob', '2026-01-01T00:00:03Z'),
    ]
    expect(computeUnread(messages, null, 'alice', members).senderColor).toBe('blue')
  })

  it('publishes no color when the sender is not in the roster', () => {
    // What the MARK does with that is `ChatButton.test.tsx`'s: it goes muted.
    const messages = [msg('ghost', '2026-01-01T00:00:01Z')]
    expect(computeUnread(messages, null, 'alice', members).senderColor).toBeNull()
  })
})
