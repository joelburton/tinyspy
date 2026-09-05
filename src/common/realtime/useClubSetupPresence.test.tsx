// cs-blessed-realtime

/**
 * Tests for useClubSetupPresence — the "someone else is already setting up a
 * game" heads-up.
 *
 * Two halves, and they have to agree. RECEIVING turns a presence roster into
 * toasts and keeps doing it on every sync, so the thing worth pinning is that
 * a peer who is still setting up gets one toast rather than another one each
 * time the server speaks. ANNOUNCING has to survive a dialog that opened
 * before the channel finished subscribing — the `SUBSCRIBED` callback and the
 * announce effect each cover a case the other cannot, and a test that never
 * separates the join ack from the mount cannot tell whether they do.
 * `channel.fake.ts` holds those two moments apart.
 *
 * The toast store is the real one, not a spy. What the hook promises are
 * claims about the stack a person is looking at — one toast per peer, in the
 * place it was already in — and half of each is the store's doing, since
 * `showToast` is what replaces by id. Asserting the id we passed in would be
 * asserting our side of a bargain nobody checks.
 */

import { act, render, renderHook } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const channel = vi.fn()
const removeChannel = vi.fn()
vi.mock('../supabase/supabase', () => ({
  supabase: {
    channel: (...a: unknown[]) => channel(...a),
    removeChannel: (c: unknown) => removeChannel(c),
  },
}))

import { useClubSetupPresence } from './useClubSetupPresence'
import { __resetChannelTeardowns } from './channelTeardown'
import { fakeChannel, lastFakeChannel } from './channel.fake'
import { dismissToast, showToast, useToasts, type Toast } from '../toasts/toastStore'

const SELF = 'u1'
type Announce = { brand: string; mode: 'coop' | 'compete'; username: string }
const MY_SETUP: Announce = { brand: 'MooseWheel', mode: 'coop', username: 'joel' }

/** A peer's presence payload, as their own `track()` sent it. */
function peer(user_id: string, username: string) {
  return [{ user_id, username, brand: 'FreeBee', mode: 'coop' as const }]
}

// The toast store is a module singleton, so a test that leaves a toast up
// hands it to the next one. Held live here and emptied in afterEach.
let live: { current: Toast[] } | null = null

/** Mount the hook beside the toast list, both under one act() umbrella. */
function mount(announce: Announce | null = null, clubHandle: string | null = 'cl1') {
  const toasts = renderHook(() => useToasts())
  live = toasts.result
  const hook = renderHook(
    ({ a }: { a: Announce | null }) =>
      useClubSetupPresence({ clubHandle, selfId: SELF, announce: a }),
    { initialProps: { a: announce } },
  )
  return { toasts: toasts.result, hook }
}

/** What the channel most recently joined is; the two server moves live on it. */
const server = () => lastFakeChannel(channel)

beforeEach(() => {
  __resetChannelTeardowns()
  channel.mockReset()
  channel.mockImplementation((name: string) => fakeChannel(name))
  removeChannel.mockReset()
  removeChannel.mockResolvedValue('ok')
})
afterEach(() => {
  for (const t of live?.current ?? []) dismissToast(t.id)
  live = null
  vi.restoreAllMocks()
})

describe('useClubSetupPresence — a peer setting up', () => {
  it('raises one toast, in words, that nobody can close', () => {
    const { toasts } = mount()
    act(() => server().subscribed())
    act(() => server().sync({ u2: peer('u2', 'moth') }))

    expect(toasts.current).toHaveLength(1)
    const [toast] = toasts.current
    // Not user-dismissible on purpose: a live status retires itself, and an X
    // would just bring it back on the next sync.
    expect(toast.dismissible).toBe(false)
    const { container } = render(<>{toast.message}</>)
    expect(container.textContent).toBe(
      'moth is setting up a new FreeBee Co-op game…',
    )
  })

  it('is still ONE toast after the next sync says the same thing', () => {
    const { toasts } = mount()
    act(() => server().subscribed())
    act(() => server().sync({ u2: peer('u2', 'moth') }))
    act(() => server().sync({ u2: peer('u2', 'moth') }))

    expect(toasts.current).toHaveLength(1)
  })

  it('and holds its place in the stack while it repeats', () => {
    const { toasts } = mount()
    act(() => server().subscribed())
    act(() => server().sync({ u2: peer('u2', 'moth') }))
    // Anything else that arrives while they are still setting up — an invite,
    // a game ending — stacks under theirs.
    act(() => void showToast({ id: 'later', message: 'something else' }))
    act(() => server().sync({ u2: peer('u2', 'moth') }))

    // The stable id is what buys this: `showToast` replaces in place, where a
    // fresh id per sync would drop the toast and re-add it at the corner, so a
    // peer who kept setting up would shuffle past everything else.
    expect(toasts.current.map((t) => t.id)).toEqual(['setup:u2', 'later'])
  })

  it('and a second peer gets a second toast', () => {
    const { toasts } = mount()
    act(() => server().subscribed())
    act(() =>
      server().sync({ u2: peer('u2', 'moth'), u3: peer('u3', 'leah') }),
    )

    expect(toasts.current).toHaveLength(2)
  })

  it('drops when they stop — their presence leaves, the toast goes', () => {
    const { toasts } = mount()
    act(() => server().subscribed())
    act(() => server().sync({ u2: peer('u2', 'moth') }))
    act(() => server().sync({}))

    expect(toasts.current).toEqual([])
  })

  it('but only theirs — my own setup is not news to me', () => {
    const { toasts } = mount(MY_SETUP)
    act(() => server().subscribed())
    act(() =>
      server().sync({ [SELF]: peer(SELF, 'joel'), u2: peer('u2', 'moth') }),
    )

    expect(toasts.current).toHaveLength(1)
  })

  it('and unmounting takes every toast it raised with it', () => {
    const { toasts, hook } = mount()
    act(() => server().subscribed())
    act(() => server().sync({ u2: peer('u2', 'moth') }))
    expect(toasts.current).toHaveLength(1)

    act(() => hook.unmount())
    expect(toasts.current).toEqual([])
    expect(removeChannel).toHaveBeenCalledTimes(1)
  })
})

describe('useClubSetupPresence — announcing my own setup', () => {
  it('waits for the join ack, then announces the dialog already open', () => {
    mount(MY_SETUP)
    // The dialog opened before the channel came up: nothing can be tracked yet.
    expect(server().track).not.toHaveBeenCalled()

    act(() => server().subscribed())
    expect(server().track).toHaveBeenCalledWith({
      user_id: SELF,
      username: 'joel',
      brand: 'MooseWheel',
      mode: 'coop',
    })
  })

  it('announces a dialog opened after the join ack', () => {
    const { hook } = mount(null)
    act(() => server().subscribed())
    expect(server().track).not.toHaveBeenCalled()

    act(() => hook.rerender({ a: MY_SETUP }))
    expect(server().track).toHaveBeenCalledTimes(1)
  })

  it('stops announcing when the dialog closes', () => {
    const { hook } = mount(MY_SETUP)
    act(() => server().subscribed())

    act(() => hook.rerender({ a: null }))
    expect(server().untrack).toHaveBeenCalledTimes(1)
  })

  it('never announces for a receive-only caller', () => {
    mount(null)
    act(() => server().subscribed())
    act(() => server().sync({ u2: peer('u2', 'moth') }))

    expect(server().track).not.toHaveBeenCalled()
  })

  it('does nothing at all with no club — there is no room to join', () => {
    const { toasts } = mount(MY_SETUP, null)

    expect(channel).not.toHaveBeenCalled()
    expect(toasts.current).toEqual([])
  })
})

describe('useClubSetupPresence — stable-name teardown gate', () => {
  it('does NOT join while the previous mount is still leaving, then joins once it lands', async () => {
    let finishLeave!: () => void
    removeChannel.mockReturnValue(new Promise<void>((r) => (finishLeave = r)))

    const { hook } = mount()
    expect(channel).toHaveBeenCalledTimes(1)
    act(() => hook.unmount())

    // Remount inside the leave round-trip: `club-setup:<handle>` is a ROOM
    // name like its sibling's, so it runs the same race.
    mount()
    expect(channel).toHaveBeenCalledTimes(1) // still waiting

    finishLeave()
    await vi.waitFor(() => expect(channel).toHaveBeenCalledTimes(2))
  })
})
