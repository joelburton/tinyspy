import { describe, it, expect } from 'vitest'
import { computeUnread } from './chatUnread'
import { colorVarFor } from '../color/memberColor'
import type { ClubMessage } from '../../hooks/chat/useClubChat'
import type { Member } from '../games'

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
      color: null,
    })
  })

  it('no lastSeen → every non-self message counts (the whole backlog)', () => {
    const messages = [
      msg('bob', '2026-01-01T00:00:01Z'),
      msg('bob', '2026-01-01T00:00:02Z'),
    ]
    expect(computeUnread(messages, null, 'alice', members)).toEqual({
      count: 2,
      color: colorVarFor('blue'), // bob = latest unread sender
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

  it('color is the LATEST unread sender (own messages do not shift it)', () => {
    const messages = [
      msg('bob', '2026-01-01T00:00:01Z'),
      msg('alice', '2026-01-01T00:00:02Z'), // mine — excluded
      msg('bob', '2026-01-01T00:00:03Z'),
    ]
    expect(computeUnread(messages, null, 'alice', members).color).toBe(
      colorVarFor('blue'),
    )
  })

  it('falls back to muted when the sender is no longer in the roster', () => {
    const messages = [msg('ghost', '2026-01-01T00:00:01Z')]
    expect(computeUnread(messages, null, 'alice', members).color).toBe(
      'var(--color-muted)',
    )
  })
})
