// cs-blessed-chat

import { describe, it, expect, vi } from 'vitest'
import { render, renderHook, screen } from '@testing-library/react'
import { useChatFeedback } from './useChatFeedback'
import type { ClubMessage } from './useClubChat'
import type { Member } from '../members/member'
import { createFeedbackSlot } from '../feedback/feedbackSlotStore'
import type { FeedbackMessage } from '../feedback/FeedbackMessage'

/**
 * useChatFeedback bridges club chat → the global feedback slot. The stream is
 * an argument, so a test drives `{messages, loading}` across renders the way a
 * real load does — nothing is mocked — and asserts the messages shown through a
 * spy on the slot's `show`. The important case is the historical one: a backlog
 * present at load must NOT replay — only messages arriving AFTER the client is
 * connected pop.
 */

/** What `useClubChat` hands the hook, as a rerender's props. */
type Stream = { messages: ClubMessage[]; loading: boolean }

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

/** Mounted mid-load, the way `<Chat>` mounts it: no messages yet. */
function setup(members: Member[] = MEMBERS) {
  const globalFeedbackSlot = createFeedbackSlot('global')
  const shown = vi.spyOn(globalFeedbackSlot, 'show')
  const midLoad: Stream = { messages: [], loading: true }
  const { rerender } = renderHook(
    (stream: Stream) =>
      useChatFeedback({ ...stream, members, selfId: 'u-self', globalFeedbackSlot }),
    { initialProps: midLoad },
  )
  return { shown, rerender }
}

describe('useChatFeedback', () => {
  it('does NOT pop historical messages present at load (the 9:05 sign-in case)', () => {
    // Mount while chat is still loading (nothing seeded yet)…
    const { shown, rerender } = setup()
    // …then the backlog (9:00 + 9:01) arrives with loading:false — seeded silently.
    rerender({
      messages: [row('1', 'u-bea', 'nine oclock'), row('2', 'u-bea', 'nine oh one')],
      loading: false,
    })
    expect(shown).not.toHaveBeenCalled()
  })

  it('pops a NEW message that arrives after load, as "HANDLE: text", the chat kind', () => {
    const { shown, rerender } = setup()
    rerender({ messages: [row('1', 'u-bea', 'old')], loading: false }) // backlog
    rerender({
      messages: [row('1', 'u-bea', 'old'), row('2', 'u-bea', 'hello there')],
      loading: false,
    })

    expect(shown).toHaveBeenCalledTimes(1)
    const feedbackMsg = shown.mock.calls[0]![0]
    expect(feedbackMsg.kind).toBe('chat')
    expect(feedbackMsg.outcome).toBe('neutral')
    expect(textOf(feedbackMsg)).toBe('bea: hello there')
  })

  it("skips the viewer's OWN messages", () => {
    const { shown, rerender } = setup()
    rerender({ messages: [], loading: false })
    rerender({ messages: [row('1', 'u-self', 'my own message')], loading: false })
    expect(shown).not.toHaveBeenCalled()
  })

  it('names an unknown sender "a player" (a roster that has not loaded)', () => {
    const { shown, rerender } = setup([]) // empty roster
    rerender({ messages: [], loading: false })
    rerender({ messages: [row('1', 'u-ghost', 'who am i')], loading: false })
    expect(textOf(shown.mock.calls[0]![0])).toBe('a player: who am i')
  })

  it("strips a leading '!' (the force-open marker) from the shown text", () => {
    const { shown, rerender } = setup()
    rerender({ messages: [], loading: false })
    rerender({ messages: [row('1', 'u-bea', '!  everyone read this')], loading: false })
    expect(textOf(shown.mock.calls[0]![0])).toBe('bea: everyone read this')
  })

  it('truncates a long message to keep the header slot from reflowing', () => {
    const { shown, rerender } = setup()
    rerender({ messages: [], loading: false })
    const long = 'x'.repeat(200)
    rerender({ messages: [row('1', 'u-bea', long)], loading: false })
    const body = textOf(shown.mock.calls[0]![0]).slice('bea: '.length)
    expect(body.length).toBe(81) // 80 chars + the ellipsis
    expect(body.endsWith('…')).toBe(true)
  })

  it('the sender is drawn bold, with the disc', () => {
    const { shown, rerender } = setup()
    rerender({ messages: [], loading: false })
    rerender({ messages: [row('1', 'u-bea', 'hi')], loading: false })
    render(<p>{shown.mock.calls[0]![0].text}</p>)
    const name = screen.getByText('bea')
    expect(name.closest('strong')).not.toBeNull()
  })
})
