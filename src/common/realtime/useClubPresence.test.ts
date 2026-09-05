// cs-audited-realtime

/**
 * Tests for useClubPresence — the stable-name teardown gate, and the one
 * roster claim that needs no server: self is always in it.
 *
 * `club:<handle>` is a ROOM name: every peer must join the identical topic or
 * presence sees nobody, so it can't take the dedup suffix the per-client data
 * channels use. That leaves it exposed to the re-create race described in
 * `channelTeardown.ts`, and this hook is the smallest consumer of the fix — a
 * good place to pin the ORDERING every stable-name room depends on. Those are
 * the rooms whose peers must all join the identical topic, so they can't take
 * the per-client dedup suffix; docs/supabase.md's channel registry lists them.
 *
 * The roster projection from a synced channel is exercised end-to-end by
 * `e2e/presence.e2e.ts` (member dots, the abandoned-game heal,
 * pause-on-disconnect) with two real browsers, which is the only way to test
 * presence honestly. What CAN be pinned here is the pre-sync answer: a
 * `channel.fake.ts` channel syncs only when a test tells it to, so its default
 * state is exactly the window the club page paints its first render in.
 */

import { act, renderHook } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const channel = vi.fn()
const removeChannel = vi.fn()
vi.mock('../supabase/supabase', () => ({
  supabase: { channel: (...a: unknown[]) => channel(...a), removeChannel: (c: unknown) => removeChannel(c) },
}))

import { useClubPresence } from './useClubPresence'
import { __resetChannelTeardowns } from './channelTeardown'
import { fakeChannel, lastFakeChannel } from './channel.fake'

beforeEach(() => {
  __resetChannelTeardowns()
  channel.mockReset()
  channel.mockImplementation((name: string) => fakeChannel(name))
  removeChannel.mockReset()
  removeChannel.mockResolvedValue('ok')
})
afterEach(() => vi.restoreAllMocks())

describe('useClubPresence — stable-name teardown gate', () => {
  it('joins immediately when the room is free (the fast path)', () => {
    renderHook(() => useClubPresence('cl1', null, 'u1'))
    expect(channel).toHaveBeenCalledTimes(1)
    expect(channel).toHaveBeenCalledWith('club:cl1', expect.anything())
  })

  it('does NOT join while the previous mount is still leaving, then joins once it lands', async () => {
    let finishLeave!: () => void
    removeChannel.mockReturnValue(new Promise<void>((r) => (finishLeave = r)))

    const first = renderHook(() => useClubPresence('cl1', null, 'u1'))
    expect(channel).toHaveBeenCalledTimes(1)
    first.unmount()
    expect(removeChannel).toHaveBeenCalledTimes(1)

    // Remount INSIDE the leave round-trip — the race. Joining here would be
    // handed realtime-js's dying cached instance (and could be rejected
    // server-side as a duplicate join).
    renderHook(() => useClubPresence('cl1', null, 'u1'))
    expect(channel).toHaveBeenCalledTimes(1) // still waiting

    finishLeave()
    await vi.waitFor(() => expect(channel).toHaveBeenCalledTimes(2))
  })

  it('a remount that unmounts again before its turn never joins at all', async () => {
    let finishLeave!: () => void
    removeChannel.mockReturnValue(new Promise<void>((r) => (finishLeave = r)))

    const first = renderHook(() => useClubPresence('cl1', null, 'u1'))
    first.unmount()
    const second = renderHook(() => useClubPresence('cl1', null, 'u1'))
    second.unmount() // gone before the gate opens

    finishLeave()
    await Promise.resolve()
    await Promise.resolve()
    // Only the original join ever happened — no leaked channel from the
    // deferred callback firing after its effect was cleaned up.
    expect(channel).toHaveBeenCalledTimes(1)
    // …and nothing was released twice.
    expect(removeChannel).toHaveBeenCalledTimes(1)
  })

  it('a DIFFERENT room is not blocked by another room leaving', () => {
    removeChannel.mockReturnValue(new Promise<void>(() => {})) // never settles
    const first = renderHook(() => useClubPresence('cl1', null, 'u1'))
    first.unmount()

    renderHook(() => useClubPresence('cl2', null, 'u1'))
    expect(channel).toHaveBeenCalledTimes(2)
    expect(channel).toHaveBeenLastCalledWith('club:cl2', expect.anything())
  })
})

describe('useClubPresence — self is in the roster', () => {
  it('from the first render, before any sync has landed', () => {
    const { result } = renderHook(() => useClubPresence('cl1', null, 'u1'))
    expect(result.current).toEqual([{ userId: 'u1', gameId: null }])
  })

  it('carrying the location the caller announced', () => {
    const { result } = renderHook(() => useClubPresence('cl1', 'g9', 'u1'))
    expect(result.current).toEqual([{ userId: 'u1', gameId: 'g9' }])
  })

  it('but not with no club — that caller has no orbit to be in', () => {
    const { result } = renderHook(() => useClubPresence(null, null, 'u1'))
    expect(result.current).toEqual([])
    expect(channel).not.toHaveBeenCalled()
  })

  it('alongside a peer, when the sync has not reported us yet', () => {
    const { result } = renderHook(() => useClubPresence('cl1', null, 'u1'))
    act(() => lastFakeChannel(channel).sync({ u2: [{ user_id: 'u2', game_id: 'g9' }] }))
    expect(result.current).toEqual([
      { userId: 'u1', gameId: null },
      { userId: 'u2', gameId: 'g9' },
    ])
  })

  it('exactly once, when the sync does report us', () => {
    const { result } = renderHook(() => useClubPresence('cl1', null, 'u1'))
    act(() =>
      lastFakeChannel(channel).sync({
        u1: [{ user_id: 'u1', game_id: null }],
        u2: [{ user_id: 'u2', game_id: 'g9' }],
      }),
    )
    expect(result.current).toEqual([
      { userId: 'u1', gameId: null },
      { userId: 'u2', gameId: 'g9' },
    ])
  })

  it('without a new array each render — the identity is a caller dependency', () => {
    const { result, rerender } = renderHook(() =>
      useClubPresence('cl1', null, 'u1'),
    )
    const first = result.current
    rerender()
    expect(result.current).toBe(first)
  })
})
