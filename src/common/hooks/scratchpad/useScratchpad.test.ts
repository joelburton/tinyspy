/**
 * Tests for useScratchpad — the raciest code in the scratchpad feature (the
 * 2026-07-05 review flagged it as having zero unit tests). Three behaviors
 * are pinned:
 *
 *   1. body-merge "newer wins" — CDC bodies apply only when their per-row
 *      `version` beats the local one (an equal/older event is dropped);
 *   2. the C3a HOLDER GUARD — while I hold the shared lock, an incoming CDC
 *      body is ignored so a write that outruns my own flush can't revert my
 *      textarea mid-keystroke (crossplay: "when we DO hold it, we ignore
 *      incoming text");
 *   3. the takeover lock lifecycle — a foreign `claim` makes the pad
 *      read-only (`editingBy` set, `canEdit` false), "Take over" unlocks only
 *      after the grace window, and a holder gone silent past STALE_MS is
 *      treated as gone.
 *
 * The supabase client is mocked at the module boundary. The channel mock
 * captures the CDC handler, the lock-broadcast handler, and the subscribe
 * callback so tests can drive events + the initial load by hand.
 */

import { renderHook, act, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { useScratchpad } from './useScratchpad'

const { mockFrom, mockRpc, mockChannel, mockRemoveChannel, mockSend } = vi.hoisted(() => ({
  mockFrom: vi.fn(),
  mockRpc: vi.fn(),
  mockChannel: vi.fn(),
  mockRemoveChannel: vi.fn(),
  mockSend: vi.fn(),
}))

vi.mock('../../lib/supabase/supabase', () => ({
  supabase: {
    schema: () => ({ from: mockFrom, rpc: mockRpc }),
    channel: mockChannel,
    removeChannel: mockRemoveChannel,
  },
}))

const GAME = '00000000-0000-0000-0000-0000000000aa'
const ME = '00000000-0000-0000-0000-0000000000bb'

type Row = { owner_id: string | null; body: string; version: number }

let loadRow: { body: string; version: number } | null = null
let cdcHandler: ((payload: { new: Row }) => void) | null = null
let lockHandler: ((msg: { payload: unknown }) => void) | null = null
let subscribeCb: ((status: string) => void) | null = null

function buildMocks() {
  loadRow = null
  cdcHandler = null
  lockHandler = null
  subscribeCb = null

  mockFrom.mockImplementation(() => {
    const base: Record<string, unknown> = {
      select: () => base,
      eq: (col: string) =>
        col === 'game_id' ? base : Promise.resolve({ data: loadRow ? [loadRow] : [], error: null }),
      is: () => Promise.resolve({ data: loadRow ? [loadRow] : [], error: null }),
    }
    return base
  })

  mockChannel.mockImplementation(() => {
    const chain: Record<string, unknown> = {
      on: (event: string, _opts: unknown, handler: (arg: never) => void) => {
        if (event === 'postgres_changes') cdcHandler = handler as (p: { new: Row }) => void
        else if (event === 'broadcast') lockHandler = handler as (m: { payload: unknown }) => void
        return chain
      },
      subscribe: (cb: (status: string) => void) => {
        subscribeCb = cb
        return chain
      },
      send: mockSend,
    }
    return chain
  })
  mockRpc.mockResolvedValue({ data: 1, error: null })
  mockRemoveChannel.mockResolvedValue(undefined)
}

const cdc = (r: Partial<Row>) =>
  cdcHandler?.({ new: { owner_id: null, body: '', version: 0, ...r } })

beforeEach(() => {
  buildMocks()
})

afterEach(() => {
  vi.clearAllMocks()
})

describe('useScratchpad — body newer-wins', () => {
  it('applies a newer CDC body and drops one that is not newer', async () => {
    loadRow = { body: 'init', version: 2 }
    const { result } = renderHook(() => useScratchpad(GAME, ME, ME, 'Me', false))
    act(() => subscribeCb?.('SUBSCRIBED'))
    await waitFor(() => expect(result.current.loading).toBe(false))
    expect(result.current.body).toBe('init')

    // A private pad (ownerId = ME) — its CDC rows carry owner_id = ME.
    act(() => cdc({ owner_id: ME, body: 'newer', version: 3 }))
    expect(result.current.body).toBe('newer')

    act(() => cdc({ owner_id: ME, body: 'equal', version: 3 }))
    expect(result.current.body).toBe('newer') // equal version dropped

    act(() => cdc({ owner_id: ME, body: 'older', version: 1 }))
    expect(result.current.body).toBe('newer') // older dropped
  })
})

describe('useScratchpad — C3a holder guard', () => {
  it('ignores incoming CDC bodies while I hold the shared lock', async () => {
    loadRow = { body: '', version: 0 }
    const { result } = renderHook(() => useScratchpad(GAME, null, ME, 'Me', false))
    act(() => subscribeCb?.('SUBSCRIBED'))
    await waitFor(() => expect(result.current.loading).toBe(false))

    // Typing claims the shared lock and echoes my text optimistically.
    act(() => result.current.setBody('hello'))
    expect(result.current.body).toBe('hello')
    expect(result.current.editingBy).toBeNull() // I'm the holder, not a foreigner

    // A body write outruns my flush (my own echo, or a racing non-holder).
    // Because I hold the lock, it must NOT clobber my in-flight text.
    act(() => cdc({ owner_id: null, body: 'clobber', version: 99 }))
    expect(result.current.body).toBe('hello')
  })
})

describe('useScratchpad — takeover lock lifecycle', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    vi.setSystemTime(0)
  })
  afterEach(() => {
    vi.useRealTimers()
  })

  it('a foreign claim locks the pad; takeover waits for grace; a silent holder goes stale', async () => {
    loadRow = { body: '', version: 0 }
    const { result } = renderHook(() => useScratchpad(GAME, null, ME, 'Me', false))
    await act(async () => {
      subscribeCb?.('SUBSCRIBED')
      await vi.advanceTimersByTimeAsync(0) // flush the load promise
    })
    expect(result.current.loading).toBe(false)

    // Bob claims the shared lock at t=0.
    act(() =>
      lockHandler?.({ payload: { type: 'claim', userId: 'bob', username: 'Bob', at: 0 } }),
    )
    expect(result.current.editingBy).toBe('Bob')
    expect(result.current.canEdit).toBe(false)
    expect(result.current.canTakeOver).toBe(false) // within the grace window

    // After the grace window, "Take over" becomes available; Bob is still
    // (barely) the live holder.
    await act(async () => {
      await vi.advanceTimersByTimeAsync(2000)
    })
    expect(result.current.canTakeOver).toBe(true) // 2000 > GRACE 1500
    expect(result.current.editingBy).toBe('Bob') // 2000 < STALE 4000

    // Past STALE_MS with no re-assert, Bob is treated as gone → pad free again.
    await act(async () => {
      await vi.advanceTimersByTimeAsync(3000) // now t=5000
    })
    expect(result.current.editingBy).toBeNull()
    expect(result.current.canEdit).toBe(true)
  })
})
