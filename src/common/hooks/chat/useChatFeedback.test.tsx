import { describe, it, expect, vi, beforeEach } from 'vitest'
import { renderHook } from '@testing-library/react'
import type { ReactElement } from 'react'
import { useChatFeedback } from './useChatFeedback'
import type { ClubMessage } from './useClubChat'
import type { GenericFeedbackMsg, Member } from '../../lib/games'

/**
 * useChatFeedback bridges club chat → the global feedback pill. We mock the chat
 * stream (`useClubChat`) so we can drive `{messages, loading}` across renders the
 * way a real load does, and assert the pills fired through a spy `globalFeedback`.
 * The important case is the historical one: a backlog present at load must NOT
 * replay — only messages arriving AFTER the client is connected pop.
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

/** Pull the handle + body text out of a shown pill's ReactNode
 *  (`<><strong>{handle}</strong>: {body}</>`). Typed to the known element shape —
 *  React 19's default `ReactElement.props` is `unknown`. */
type PillText = ReactElement<{
  children: [ReactElement<{ children: string }>, string, string]
}>
function readPill(msg: GenericFeedbackMsg) {
  const children = (msg.text as PillText).props.children
  return { handle: children[0].props.children, body: children[2] }
}

function setup(members: Member[] = MEMBERS) {
  const globalFeedback = { show: vi.fn(), clear: vi.fn() }
  const { rerender } = renderHook(() =>
    useChatFeedback({ clubHandle: 'club', members, selfId: 'u-self', globalFeedback }),
  )
  return { globalFeedback, rerender }
}

beforeEach(() => {
  chat.state = { messages: [], loading: true }
})

describe('useChatFeedback', () => {
  it('does NOT pop historical messages present at load (the 9:05 sign-in case)', () => {
    // Mount while chat is still loading (nothing seeded yet)…
    const { globalFeedback, rerender } = setup()
    // …then the backlog (9:00 + 9:01) arrives with loading:false — seeded silently.
    chat.state = { messages: [row('1', 'u-bea', 'nine oclock'), row('2', 'u-bea', 'nine oh one')], loading: false }
    rerender()
    expect(globalFeedback.show).not.toHaveBeenCalled()
  })

  it('pops a NEW message that arrives after load, as "HANDLE: text" with a color dot + timed 2s + neutral', () => {
    const { globalFeedback, rerender } = setup()
    chat.state = { messages: [row('1', 'u-bea', 'old')], loading: false } // backlog
    rerender()
    chat.state = { messages: [row('1', 'u-bea', 'old'), row('2', 'u-bea', 'hello there')], loading: false }
    rerender()

    expect(globalFeedback.show).toHaveBeenCalledTimes(1)
    const msg = globalFeedback.show.mock.calls[0][0] as GenericFeedbackMsg
    expect(readPill(msg)).toEqual({ handle: 'bea', body: 'hello there' })
    expect(msg.dot).toBeTruthy() // a resolved member → an identity disc
    expect(msg.dismiss).toEqual({ kind: 'timed', ms: 2000 })
    expect(msg.tone).toBe('neutral')
  })

  it("skips the viewer's OWN messages", () => {
    const { globalFeedback, rerender } = setup()
    chat.state = { messages: [], loading: false }
    rerender()
    chat.state = { messages: [row('1', 'u-self', 'my own message')], loading: false }
    rerender()
    expect(globalFeedback.show).not.toHaveBeenCalled()
  })

  it("names an unknown sender '?' with no dot (roster not yet loaded)", () => {
    const { globalFeedback, rerender } = setup([]) // empty roster
    chat.state = { messages: [], loading: false }
    rerender()
    chat.state = { messages: [row('1', 'u-ghost', 'who am i')], loading: false }
    rerender()
    const msg = globalFeedback.show.mock.calls[0][0] as GenericFeedbackMsg
    expect(readPill(msg).handle).toBe('?')
    expect(msg.dot).toBeUndefined()
  })

  it("strips a leading '!' (the force-open marker) from the shown text", () => {
    const { globalFeedback, rerender } = setup()
    chat.state = { messages: [], loading: false }
    rerender()
    chat.state = { messages: [row('1', 'u-bea', '!  everyone read this')], loading: false }
    rerender()
    expect(readPill(globalFeedback.show.mock.calls[0][0]).body).toBe('everyone read this')
  })

  it('truncates a long message to keep the header slot from reflowing', () => {
    const { globalFeedback, rerender } = setup()
    chat.state = { messages: [], loading: false }
    rerender()
    const long = 'x'.repeat(200)
    chat.state = { messages: [row('1', 'u-bea', long)], loading: false }
    rerender()
    const body = readPill(globalFeedback.show.mock.calls[0][0]).body
    expect(body.length).toBe(81) // 80 chars + the ellipsis
    expect(body.endsWith('…')).toBe(true)
  })
})
