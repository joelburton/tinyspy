/**
 * Tests for useClubPresence — specifically the stable-name teardown gate.
 *
 * `club:<handle>` is a ROOM name: every peer must join the identical topic or
 * presence sees nobody, so it can't take the dedup suffix the per-client data
 * channels use. That leaves it exposed to the re-create race described in
 * `lib/supabase/channelTeardown.ts`, and this hook is the smallest consumer of
 * the fix — a good place to pin the ORDERING the other three share.
 *
 * The roster projection itself is exercised end-to-end by `e2e/presence.e2e.ts`
 * (member dots, the abandoned-game heal, pause-on-disconnect) with two real
 * browsers, which is the only way to test presence honestly.
 */

import { renderHook } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const channel = vi.fn()
const removeChannel = vi.fn()
vi.mock('../../lib/supabase/supabase', () => ({
  supabase: { channel: (...a: unknown[]) => channel(...a), removeChannel: (c: unknown) => removeChannel(c) },
}))

import { useClubPresence } from './useClubPresence'
import { __resetChannelTeardowns } from '../../lib/supabase/channelTeardown'

/** A chainable fake channel, shaped like realtime-js's (incl. `topic`). */
function fakeChannel(name: string) {
  const ch: Record<string, unknown> = {
    topic: `realtime:${name}`,
    on: () => ch,
    subscribe: () => ch,
    track: vi.fn(),
    untrack: vi.fn(),
    presenceState: () => ({}),
  }
  return ch
}

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
