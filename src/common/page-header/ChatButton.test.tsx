// cs-audited-chat

/**
 * The chat mark turns what `chatUnread` publishes — a count and the sender's
 * palette-color NAME — into what the bubble looks like. The two arms of that
 * are here: a named sender fills the glyph with their color, and a sender the
 * roster cannot name goes muted rather than taking `colorVarFor`'s body-ink
 * fallback.
 */
import { act, render, screen } from '@testing-library/react'
import { beforeEach, describe, expect, it } from 'vitest'
import { setChatOpen } from '../chat/chatOpenStore'
import { setChatUnread } from '../chat/chatUnread'
import { colorVarFor } from '../members/memberColor'
import { ChatButton } from './ChatButton'

/** The bubble, whose inline style carries the fill. */
const bubble = () => screen.getByRole('button', { name: 'Chat' })

beforeEach(() => {
  setChatOpen(false)
  setChatUnread({ count: 0, senderColor: null })
})

describe('ChatButton', () => {
  it("fills the glyph with the unread sender's color, and shows the count", () => {
    render(<ChatButton />)
    act(() => setChatUnread({ count: 2, senderColor: 'blue' }))
    expect(bubble().style.getPropertyValue('--chat-unread-color')).toBe(colorVarFor('blue'))
    expect(screen.getByText('2')).toBeTruthy()
  })

  it('goes muted when the roster does not name the sender', () => {
    render(<ChatButton />)
    act(() => setChatUnread({ count: 1, senderColor: null }))
    expect(bubble().style.getPropertyValue('--chat-unread-color')).toBe(
      'var(--page-text-muted-color)',
    )
  })

  it('stays hollow with nothing unread, and while the panel is open', () => {
    render(<ChatButton />)
    expect(bubble().style.getPropertyValue('--chat-unread-color')).toBe('')

    act(() => setChatUnread({ count: 3, senderColor: 'blue' }))
    act(() => setChatOpen(true))
    expect(bubble().style.getPropertyValue('--chat-unread-color')).toBe('')
    expect(screen.queryByText('3')).toBeNull()
  })
})
