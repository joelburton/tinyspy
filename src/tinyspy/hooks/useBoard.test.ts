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

// Build a supabase chain mock that recognizes the patterns the hook uses.
// With seats now as columns on tinyspy.games, both the own-key and
// peer-key queries read from `games` — the hook picks the right column
// (key_card_a vs key_card_b) based on whether userId === user_a_id.
//
// In these tests USER_ID plays seat A by construction, so:
//   - key_card_a = the caller's own key (ownKey)
//   - key_card_b = the peer's key (peerKey)
function buildSupabaseMock() {
  mockFrom.mockImplementation((table: string) => {
    const chain: Record<string, unknown> & { _table: string } = {
      _table: table,
      select() { return chain },
      eq() { return chain },
      neq() { return chain },
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
        // games row — caller (USER_ID) is in seat A; the other seat
        // belongs to a sentinel uuid. Both key columns are returned;
        // the hook chooses based on user_a_id/user_b_id comparison.
        return Promise.resolve({
          data: {
            user_a_id: USER_ID,
            user_b_id: '00000000-0000-0000-0000-00000000cccc',
            key_card_a: ownKey,
            key_card_b: peerKey,
          },
          error: null,
        })
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
    // The contract: if revealPeer ever flips back to false, peerKey
    // must clear so a previous game's partner-key can't leak into a
    // re-rendered view. In today's FE this transition isn't reached
    // in practice (App.tsx keys each game's Root by gameId, so
    // navigating between games remounts the hook from scratch
    // rather than rerendering it with new props). The test stays
    // as a guard against future refactors that retain the hook
    // across game changes.
    const { result, rerender } = renderHook(
      ({ revealPeer }: { revealPeer: boolean }) => useBoard(GAME_ID, USER_ID, revealPeer),
      { initialProps: { revealPeer: true } },
    )

    await waitFor(() => expect(result.current.peerKey).toEqual(peerKey))

    rerender({ revealPeer: false })
    // peerKey is a derived value (revealPeer && fetchedFor === `${gameId}:${userId}`
    // ? fetchedPeerKey : null). Flipping revealPeer to false makes the
    // derivation evaluate to null on the next render — no clear-state
    // action needed inside the hook.
    await waitFor(() => expect(result.current.peerKey).toBeNull())
  })
})
