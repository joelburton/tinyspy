// cs-unmet

/**
 * THE PICKS ROOM. Coop joins the stable room `connections:<gameId>` — stable
 * so every peer shares the Broadcast — and a click applies locally and goes
 * on the wire; compete joins nothing and applies locally. The room is keyed on
 * the game alone, so a re-render with the same game must not rebuild it, and
 * a new game must.
 */

import { act, renderHook } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const { mockChannel, mockRemoveChannel } = vi.hoisted(() => ({
  mockChannel: vi.fn(),
  mockRemoveChannel: vi.fn(),
}))

vi.mock('@/common/supabase/supabase', () => ({
  supabase: { channel: mockChannel, removeChannel: mockRemoveChannel },
}))

import { usePicks } from './usePicks'

// The picks room, as realtime-js would hand it back: the hook chains
// `.channel(name).on(…).subscribe()`, and `broadcast` calls `.send(…)`.
// `topic` is what the teardown registry keys off.
const channelChain = {
  topic: 'realtime:connections:g1',
  on: vi.fn(function () {
    return channelChain
  }),
  subscribe: vi.fn(function () {
    return channelChain
  }),
  send: vi.fn(() => Promise.resolve('ok')),
}

type Props = { gameId: string; isCompete: boolean; myId: string }
const COOP: Props = { gameId: 'g1', isCompete: false, myId: 'u1' }
const COMPETE: Props = { gameId: 'g1', isCompete: true, myId: 'u1' }

beforeEach(() => {
  vi.clearAllMocks()
  mockChannel.mockReturnValue(channelChain)
  mockRemoveChannel.mockResolvedValue('ok')
})

describe('connections usePicks — the picks room', () => {
  it('coop joins the game\'s room once, and a re-render does not rebuild it', () => {
    const { rerender } = renderHook((p: Props) => usePicks(p), { initialProps: COOP })
    expect(mockChannel).toHaveBeenCalledTimes(1)
    expect(mockChannel).toHaveBeenCalledWith('connections:g1')

    rerender({ ...COOP })
    expect(mockChannel).toHaveBeenCalledTimes(1)
    expect(mockRemoveChannel).not.toHaveBeenCalled()
  })

  it('rebuilds the room when the game changes', () => {
    const { rerender } = renderHook((p: Props) => usePicks(p), { initialProps: COOP })
    rerender({ ...COOP, gameId: 'g2' })
    expect(mockRemoveChannel).toHaveBeenCalledTimes(1)
    expect(mockChannel).toHaveBeenCalledTimes(2)
    expect(mockChannel).toHaveBeenLastCalledWith('connections:g2')
  })

  it('coop applies a click locally and puts it on the wire', () => {
    const { result } = renderHook(() => usePicks(COOP))
    act(() => result.current.toggleTile('a'))
    expect(result.current.union).toEqual(['a'])
    expect(result.current.tileToPickerId.get('a')).toBe('u1')
    expect(channelChain.send).toHaveBeenCalledWith({
      type: 'broadcast', event: 'pick', payload: { type: 'pick', tile: 'a', userId: 'u1' },
    })
  })

  it('compete joins no room, and a click stays on this client', () => {
    const { result } = renderHook(() => usePicks(COMPETE))
    expect(mockChannel).not.toHaveBeenCalled()
    act(() => result.current.toggleTile('a'))
    expect(result.current.union).toEqual(['a'])
    expect(channelChain.send).not.toHaveBeenCalled()
  })

  it('a clear empties the picks', () => {
    const { result } = renderHook(() => usePicks(COMPETE))
    act(() => result.current.toggleTile('a'))
    act(() => result.current.sendClear())
    expect(result.current.union).toEqual([])
  })

  it('the guess is complete at four tiles, and a fifth pick is refused', () => {
    const { result } = renderHook(() => usePicks(COMPETE))
    for (const tile of ['a', 'b', 'c']) act(() => result.current.toggleTile(tile))
    expect(result.current.isComplete).toBe(false)
    act(() => result.current.toggleTile('d'))
    expect(result.current.isComplete).toBe(true)
    act(() => result.current.toggleTile('e'))
    expect(result.current.union).toEqual(['a', 'b', 'c', 'd'])
  })
})
