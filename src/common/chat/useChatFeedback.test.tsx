// cs-met-chat

import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, renderHook, screen } from '@testing-library/react'
import { useChatFeedback } from './useChatFeedback'
import type { ClubMessage } from './useClubChat'
import type { Member } from '../members/member'
import { createFeedbackSlot } from '../feedback/feedbackSlotStore'
import type { FeedbackMessage } from '../feedback/FeedbackMessage'

/**
 * useChatFeedback bridges club chat → the global feedback slot. We mock the
 * chat stream (`useClubChat`) so we can drive `{messages, loading}` across
 * renders the way a real load does, and assert the messages shown through a
 * spy on the slot's `show`. The important case is the historical one: a
 * backlog present at load must NOT replay — only messages arriving AFTER the
 * client is connected pop.
 */

// A mutable holder the mocked useClubChat reads each call; tests reassign it then
// rerender. `vi.hoisted` so it exists when the (hoisted) vi.mock factory runs.
const chat = vi.hoisted(() => ({
  state: { messages: [] as ClubMessage[], loading: true },
}))
vi.mock('./useClubChat', () => ({ useClubChat: () => chat.state }))

const MEMBERS: Member[] = [
  { user_id: 'u-bea', username: 'bea', color: 'blue' },
  { user_id: 'u-self', username: 'me', color: 'red' },
]

const row = (id: string, user_id: string, content: string): ClubMessage => ({
  id,
  user_id,
  content,
  sent_at: id,
})

/** The words a shown message would put on screen — its node rendered, read
 *  back as text: "bea: hello there". */
function textOf(feedbackMsg: FeedbackMessage): string {
  const { container, unmount } = render(<p>{feedbackMsg.text}</p>)
  const text = container.textContent ?? ''
  unmount()
  return text
}

function setup(members: Member[] = MEMBERS) {
  const globalFeedbackSlot = createFeedbackSlot('global')
  const shown = vi.spyOn(globalFeedbackSlot, 'show')
  const { rerender } = renderHook(() =>
    useChatFeedback({ clubHandle: 'club', members, selfId: 'u-self', globalFeedbackSlot }),
  )
  return { shown, rerender }
}

beforeEach(() => {
  chat.state = { messages: [], loading: true }
})

describe('useChatFeedback', () => {
  it('does NOT pop historical messages present at load (the 9:05 sign-in case)', () => {
    // Mount while chat is still loading (nothing seeded yet)…
    const { shown, rerender } = setup()
    // …then the backlog (9:00 + 9:01) arrives with loading:false — seeded silently.
    chat.state = { messages: [row('1', 'u-bea', 'nine oclock'), row('2', 'u-bea', 'nine oh one')], loading: false }
    rerender()
    expect(shown).not.toHaveBeenCalled()
  })

  it('pops a NEW message that arrives after load, as "HANDLE: text", the chat kind', () => {
    const { shown, rerender } = setup()
    chat.state = { messages: [row('1', 'u-bea', 'old')], loading: false } // backlog
    rerender()
    chat.state = { messages: [row('1', 'u-bea', 'old'), row('2', 'u-bea', 'hello there')], loading: false }
    rerender()

    expect(shown).toHaveBeenCalledTimes(1)
    const feedbackMsg = shown.mock.calls[0]![0]
    expect(feedbackMsg.kind).toBe('chat')
    expect(feedbackMsg.outcome).toBe('neutral')
    expect(textOf(feedbackMsg)).toBe('bea: hello there')
  })

  it("skips the viewer's OWN messages", () => {
    const { shown, rerender } = setup()
    chat.state = { messages: [], loading: false }
    rerender()
    chat.state = { messages: [row('1', 'u-self', 'my own message')], loading: false }
    rerender()
    expect(shown).not.toHaveBeenCalled()
  })

  it('names an unknown sender "a player" (a roster that has not loaded)', () => {
    const { shown, rerender } = setup([]) // empty roster
    chat.state = { messages: [], loading: false }
    rerender()
    chat.state = { messages: [row('1', 'u-ghost', 'who am i')], loading: false }
    rerender()
    expect(textOf(shown.mock.calls[0]![0])).toBe('a player: who am i')
  })

  it("strips a leading '!' (the force-open marker) from the shown text", () => {
    const { shown, rerender } = setup()
    chat.state = { messages: [], loading: false }
    rerender()
    chat.state = { messages: [row('1', 'u-bea', '!  everyone read this')], loading: false }
    rerender()
    expect(textOf(shown.mock.calls[0]![0])).toBe('bea: everyone read this')
  })

  it('truncates a long message to keep the header slot from reflowing', () => {
    const { shown, rerender } = setup()
    chat.state = { messages: [], loading: false }
    rerender()
    const long = 'x'.repeat(200)
    chat.state = { messages: [row('1', 'u-bea', long)], loading: false }
    rerender()
    const body = textOf(shown.mock.calls[0]![0]).slice('bea: '.length)
    expect(body.length).toBe(81) // 80 chars + the ellipsis
    expect(body.endsWith('…')).toBe(true)
  })

  it('the sender is drawn bold, with the disc', () => {
    const { shown, rerender } = setup()
    chat.state = { messages: [], loading: false }
    rerender()
    chat.state = { messages: [row('1', 'u-bea', 'hi')], loading: false }
    rerender()
    render(<p>{shown.mock.calls[0]![0].text}</p>)
    const name = screen.getByText('bea')
    expect(name.closest('strong')).not.toBeNull()
  })
})
