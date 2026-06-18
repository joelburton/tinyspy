/**
 * Tests for useClubChat. This hook is the pattern parent for every
 * "initial load + Realtime INSERT append + SUBSCRIBED refetch on
 * reconnect" shape in the repo (the per-game useBoard / useClues /
 * wordknit useGame all repeat it). Pinning the contract here once
 * documents what every sibling hook is expected to do.
 *
 * Mocking strategy
 * ----------------
 * Same shape as useSession.test.ts:
 *   - vi.mock replaces `../lib/supabase` with hand-built spies.
 *   - The supabase.channel() chain (.on().on().subscribe()) is
 *     mocked so tests can capture the INSERT handler and the
 *     SUBSCRIBED-status callback, then fire them manually to
 *     simulate Realtime events.
 *   - commonDb is `supabase.schema('common')`; the schema()→from()
 *     →select()→eq()→order() chain is collapsed to its terminal
 *     mock the same way useSession does for maybeSingle.
 *
 * What's covered:
 *   - Initial load populates messages from the DB query
 *   - SUBSCRIBED status triggers a refetch
 *   - An INSERT event appends a new message to the list
 *   - Cleanup removes the channel on unmount
 *   - Switching clubId tears down the old channel and creates a new one
 *
 * Out of scope: the precise Realtime channel name (it includes a
 * crypto-random suffix from channelDedupSuffix — tested separately).
 */

import { renderHook, waitFor, act } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

type InsertHandler = (payload: { new: { id: string; user_id: string; content: string } }) => void
type StatusCallback = (status: string) => void

const {
  mockChannel,
  mockRemoveChannel,
  mockOrder,
  mockSchemaFrom,
} = vi.hoisted(() => {
  // Per-test handlers — set by the spied .on()/.subscribe() calls.
  const handlers: { insert: InsertHandler | null; status: StatusCallback | null } = {
    insert: null,
    status: null,
  }
  const channelObj = {
    on: vi.fn(function (
      this: typeof channelObj,
      _event: string,
      _filter: unknown,
      handler: InsertHandler,
    ) {
      handlers.insert = handler
      return this
    }),
    subscribe: vi.fn(function (this: typeof channelObj, cb: StatusCallback) {
      handlers.status = cb
      return this
    }),
  }
  return {
    mockChannel: vi.fn(() => channelObj),
    mockRemoveChannel: vi.fn(),
    mockOrder: vi.fn(),
    mockSchemaFrom: vi.fn(),
    // Re-export the handler refs for tests via getters below.
    handlers,
  }
})

// Pull the handlers ref out into a shared module-scope so tests
// can fire INSERT / status events.
const channelHandlers: {
  insert: InsertHandler | null
  status: StatusCallback | null
} = { insert: null, status: null }

vi.mock('../lib/supabase', () => ({
  supabase: {
    channel: mockChannel,
    removeChannel: mockRemoveChannel,
    // schema() returns an object whose .from() returns the
    // configurable per-test mock. Collapses to mockOrder as the
    // terminal of the query chain.
    schema: () => ({
      from: mockSchemaFrom,
    }),
  },
}))

// channelDedup uses crypto.randomUUID — stub it so the channel
// name is deterministic in tests. Not asserted on, just stable.
vi.mock('../lib/channelDedup', () => ({
  channelDedupSuffix: () => 'test-suffix',
}))

import { useClubChat } from './useClubChat'

beforeEach(() => {
  channelHandlers.insert = null
  channelHandlers.status = null
  mockChannel.mockClear()
  mockRemoveChannel.mockClear()
  mockOrder.mockReset()
  mockSchemaFrom.mockReset()

  // Rebuild the channel mock so each test gets fresh handler
  // capture (otherwise late-arriving handlers from a previous
  // test could fire into the new one's hook).
  const channelObj = {
    on: vi.fn(function (
      this: { on: unknown; subscribe: unknown },
      _event: string,
      _filter: unknown,
      handler: InsertHandler,
    ) {
      channelHandlers.insert = handler
      return this
    }),
    subscribe: vi.fn(function (
      this: { on: unknown; subscribe: unknown },
      cb: StatusCallback,
    ) {
      channelHandlers.status = cb
      return this
    }),
  }
  mockChannel.mockReturnValue(channelObj as never)

  // Default DB query chain: from('messages').select().eq().order()
  // resolves to { data: [], error: null }. Individual tests override
  // mockOrder for specific payloads.
  mockOrder.mockResolvedValue({ data: [], error: null })
  mockSchemaFrom.mockReturnValue({
    select: () => ({
      eq: () => ({
        order: mockOrder,
      }),
    }),
  })
})

afterEach(() => {
  vi.clearAllMocks()
})

describe('useClubChat', () => {
  it('loads initial messages from the DB', async () => {
    mockOrder.mockResolvedValueOnce({
      data: [
        { id: 'm1', user_id: 'ada', content: 'hi' },
        { id: 'm2', user_id: 'bea', content: 'hello' },
      ],
      error: null,
    })

    const { result } = renderHook(() => useClubChat('club-1'))

    await waitFor(() => expect(result.current.loading).toBe(false))
    expect(result.current.messages).toEqual([
      { id: 'm1', user_id: 'ada', content: 'hi' },
      { id: 'm2', user_id: 'bea', content: 'hello' },
    ])
  })

  it('appends a new message when an INSERT event fires', async () => {
    mockOrder.mockResolvedValueOnce({
      data: [{ id: 'm1', user_id: 'ada', content: 'hi' }],
      error: null,
    })

    const { result } = renderHook(() => useClubChat('club-1'))
    await waitFor(() => expect(result.current.loading).toBe(false))

    expect(channelHandlers.insert).not.toBeNull()
    act(() => {
      channelHandlers.insert!({
        new: { id: 'm2', user_id: 'bea', content: 'hello' },
      })
    })

    expect(result.current.messages).toEqual([
      { id: 'm1', user_id: 'ada', content: 'hi' },
      { id: 'm2', user_id: 'bea', content: 'hello' },
    ])
  })

  it('refetches on SUBSCRIBED status (reconnect recovery)', async () => {
    // First load: one message.
    mockOrder.mockResolvedValueOnce({
      data: [{ id: 'm1', user_id: 'ada', content: 'hi' }],
      error: null,
    })

    const { result } = renderHook(() => useClubChat('club-1'))
    await waitFor(() => expect(result.current.loading).toBe(false))
    expect(result.current.messages).toHaveLength(1)

    // Second load (post-reconnect): backlog includes a message
    // we missed while disconnected. The SUBSCRIBED callback
    // should pick it up via a fresh load().
    mockOrder.mockResolvedValueOnce({
      data: [
        { id: 'm1', user_id: 'ada', content: 'hi' },
        { id: 'missed', user_id: 'bea', content: 'while you were out' },
      ],
      error: null,
    })

    expect(channelHandlers.status).not.toBeNull()
    act(() => {
      channelHandlers.status!('SUBSCRIBED')
    })

    await waitFor(() => expect(result.current.messages).toHaveLength(2))
    expect(result.current.messages[1].content).toBe('while you were out')
  })

  it('does not refetch on non-SUBSCRIBED statuses', async () => {
    mockOrder.mockResolvedValueOnce({ data: [], error: null })
    renderHook(() => useClubChat('club-1'))
    await waitFor(() => expect(mockOrder).toHaveBeenCalledTimes(1))

    // Reconnecting / channel closed / errored — none of these
    // should fire a refetch (only SUBSCRIBED does).
    act(() => channelHandlers.status!('CHANNEL_ERROR'))
    act(() => channelHandlers.status!('CLOSED'))
    expect(mockOrder).toHaveBeenCalledTimes(1)
  })

  it('removes the channel on unmount', async () => {
    mockOrder.mockResolvedValueOnce({ data: [], error: null })
    const { unmount } = renderHook(() => useClubChat('club-1'))
    await waitFor(() => expect(mockChannel).toHaveBeenCalledTimes(1))

    unmount()
    expect(mockRemoveChannel).toHaveBeenCalledTimes(1)
  })

  it('rebuilds the channel when clubId changes', async () => {
    mockOrder.mockResolvedValue({ data: [], error: null })
    const { rerender } = renderHook(({ id }) => useClubChat(id), {
      initialProps: { id: 'club-1' },
    })
    await waitFor(() => expect(mockChannel).toHaveBeenCalledTimes(1))

    rerender({ id: 'club-2' })

    // The old channel was removed and a new one created.
    await waitFor(() => expect(mockChannel).toHaveBeenCalledTimes(2))
    expect(mockRemoveChannel).toHaveBeenCalledTimes(1)
  })
})
