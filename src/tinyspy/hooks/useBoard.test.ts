/**
 * Tests for useBoard, specifically the peerKey toggle.
 *
 * The peer key (the partner's view of the board) is sensitive during
 * play and is only fetched once the game is over (`revealPeer === true`).
 * If `revealPeer` ever flips BACK to false — for instance when the
 * player navigates to a fresh game via Play-again — `peerKey` must
 * clear, or the previous game's partner-key would leak into the new
 * game's render.
 *
 * Other shapes (initial load of words + own key, the channel
 * subscription) are exercised here as a side effect but not asserted
 * deeply; those paths are covered by the pgTAP suite at the RPC
 * layer plus integration testing in a browser.
 */

import { renderHook, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const ownKey = ['G', 'N', 'A', 'G', 'N', 'A', 'G', 'N', 'A', 'G', 'N', 'A', 'G', 'N', 'A', 'G', 'N', 'A', 'G', 'N', 'A', 'G', 'N', 'A', 'G']
const peerKey = ['A', 'N', 'G', 'A', 'N', 'G', 'A', 'N', 'G', 'A', 'N', 'G', 'A', 'N', 'G', 'A', 'N', 'G', 'A', 'N', 'G', 'A', 'N', 'G', 'A']

const { mockFrom, mockChannel, mockRemoveChannel } = vi.hoisted(() => ({
  mockFrom: vi.fn(),
  mockChannel: vi.fn(),
  mockRemoveChannel: vi.fn(),
}))

vi.mock('../../common/lib/supabase', () => ({
  supabase: {
    // .schema('tinyspy').from(...) is how every table query in the hook
    // is built; the mock collapses .schema() to a passthrough that
    // exposes the same chainable mockFrom — no need to model schema
    // routing in the test.
    schema: () => ({ from: mockFrom }),
    from: mockFrom,
    channel: mockChannel,
    removeChannel: mockRemoveChannel,
  },
}))

import { useBoard } from './useBoard'

const GAME_ID = '00000000-0000-0000-0000-00000000aaaa'
const USER_ID = '00000000-0000-0000-0000-00000000bbbb'

// Build a supabase chain mock that recognizes the patterns the hook uses
// and returns matching shapes. The distinguishing feature between the
// own-key and peer-key queries is `.neq('user_id', ...)` (peer) vs a
// second `.eq('user_id', ...)` (own).
function buildSupabaseMock() {
  mockFrom.mockImplementation((table: string) => {
    const chain: Record<string, unknown> & { _table: string; _neq: boolean } = {
      _table: table,
      _neq: false,
      select() { return chain },
      eq() { return chain },
      neq() { chain._neq = true; return chain },
      order() {
        // Only words uses .order() — return 25 word rows.
        return Promise.resolve({
          data: Array.from({ length: 25 }, (_, position) => ({
            game_id: GAME_ID,
            position,
            word: `W${position}`,
            revealed_by: null,
            revealed_as: null,
            revealed_at: null,
            revealed_in_turn: null,
          })),
          error: null,
        })
      },
      single() {
        if (chain._neq) {
          return Promise.resolve({ data: { key_card: peerKey }, error: null })
        }
        return Promise.resolve({ data: { key_card: ownKey }, error: null })
      },
    }
    return chain
  })

  // The hook chains `.channel(name).on(...).on(...).subscribe()` — using
  // `mockReturnThis` (via the chainable object) keeps the chain alive.
  const channelChain = {
    on: vi.fn().mockReturnThis(),
    subscribe: vi.fn().mockReturnThis(),
  }
  mockChannel.mockReturnValue(channelChain)
}

beforeEach(() => {
  buildSupabaseMock()
})

afterEach(() => {
  vi.clearAllMocks()
})

describe('useBoard', () => {
  it('loads words and the caller\'s own key', async () => {
    const { result } = renderHook(() => useBoard(GAME_ID, USER_ID, false))

    await waitFor(() => expect(result.current.loading).toBe(false))
    expect(result.current.words).toHaveLength(25)
    expect(result.current.myKey).toEqual(ownKey)
    // Peer key not fetched while the game is still in progress.
    expect(result.current.peerKey).toBeNull()
  })

  it('fetches the peer key only when revealPeer is true', async () => {
    const { result, rerender } = renderHook(
      ({ revealPeer }: { revealPeer: boolean }) => useBoard(GAME_ID, USER_ID, revealPeer),
      { initialProps: { revealPeer: false } },
    )

    // Wait for initial load to settle.
    await waitFor(() => expect(result.current.loading).toBe(false))
    expect(result.current.peerKey).toBeNull()

    // Game ends → revealPeer flips true → peer key arrives.
    rerender({ revealPeer: true })
    await waitFor(() => expect(result.current.peerKey).toEqual(peerKey))
  })

  it('clears the peer key when revealPeer flips back to false', async () => {
    // The scenario that matters: user finishes game 1, sees the peer key
    // in the post-game review, clicks Play again → revealPeer goes back
    // to false in the fresh game. peerKey must be cleared, not stale.
    const { result, rerender } = renderHook(
      ({ revealPeer }: { revealPeer: boolean }) => useBoard(GAME_ID, USER_ID, revealPeer),
      { initialProps: { revealPeer: true } },
    )

    await waitFor(() => expect(result.current.peerKey).toEqual(peerKey))

    rerender({ revealPeer: false })
    // Synchronous in the effect: when revealPeer is false the hook calls
    // setPeerKey(null) immediately. No fetch to wait on.
    await waitFor(() => expect(result.current.peerKey).toBeNull())
  })
})
