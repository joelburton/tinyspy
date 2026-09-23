// cs-met-codenamesduet

/**
 * Tests for useBoard: the load (the words, the caller's own key, the events
 * typed by kind), the peerKey gate, and a failed read.
 *
 * The partner's key is loaded with the games row but exposed only while
 * `revealPeer` is true; hiding it again must clear `peerKey`. A failed read
 * has to arrive as its own answer, because an empty board and an unreadable
 * one look identical from `words` alone.
 */

import { act, renderHook, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const ownKey = ['G', 'N', 'A', 'G', 'N', 'A', 'G', 'N', 'A', 'G', 'N', 'A', 'G', 'N', 'A', 'G', 'N', 'A', 'G', 'N', 'A', 'G', 'N', 'A', 'G']
const peerKey = ['A', 'N', 'G', 'A', 'N', 'G', 'A', 'N', 'G', 'A', 'N', 'G', 'A', 'N', 'G', 'A', 'N', 'G', 'A', 'N', 'G', 'A', 'N', 'G', 'A']

const { mockFrom, mockChannel, mockRemoveChannel } = vi.hoisted(() => ({
  mockFrom: vi.fn(),
  mockChannel: vi.fn(),
  mockRemoveChannel: vi.fn(),
}))

vi.mock('@/common/supabase/supabase', () => ({
  supabase: {
    // .schema('codenamesduet').from(...) is how every table query in the hook
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
// Both key cards are columns on codenamesduet.games — the hook picks the
// right one (key_card_a vs key_card_b) by whether userId === user_a_id.
//
// In these tests USER_ID plays seat A by construction, so:
//   - key_card_a = the caller's own key (ownKey)
//   - key_card_b = the peer's key (peerKey)
function buildSupabaseMock() {
  mockFrom.mockImplementation((table: string) => {
    const chain: Record<string, unknown> & { _table: string } = {
      _table: table,
      select() { return chain },
      // `.eq()` is the terminal for games, which reads one row and orders
      // nothing. Words and events chain further, off `.order()`.
      // The games row carries no `.single()`: `readRows` hands back rows, so
      // zero of them is an answer rather than an error.
      eq() {
        if (table === 'games') {
          // Caller (USER_ID) is in seat A; the other seat belongs to a sentinel
          // uuid. Both key columns come back and the hook picks by comparing
          // user_a_id / user_b_id.
          return Promise.resolve({
            data: gameGone ? [] : [{
              user_a_id: USER_ID,
              user_b_id: '00000000-0000-0000-0000-00000000cccc',
              key_card_a: ownKey,
              key_card_b: peerKey,
            }],
            error: null,
          })
        }
        return chain
      },
      neq() { return chain },
      order() {
        if (table === 'events') return Promise.resolve({ data: events, error: null })
        // Otherwise it is words — return 25 word rows.
        return Promise.resolve({
          data: Array.from({ length: 25 }, (_, position) => ({
            game_id: GAME_ID,
            position,
            word: `W${position}`,
            revealed_as: null,
            neutral_a: false,
            neutral_b: false,
          })),
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
    // Keeps the status callback, so a test can announce SUBSCRIBED — the
    // refetch `useRealtimeRefetch` runs on every (re)subscribe.
    subscribe: vi.fn(function (this: unknown, cb: (status: string) => void) {
      onStatus = cb
      return this
    }),
  }
  mockChannel.mockReturnValue(channelChain)
}

// The events rows the next load returns, as the table hands them back.
let events: unknown[] = []
// True once the games row is gone: the next read of it answers zero rows.
let gameGone = false
// The subscription's status callback, kept by the channel mock.
let onStatus: ((status: string) => void) | null = null

beforeEach(() => {
  events = []
  gameGone = false
  onStatus = null
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

  it('hands back the events typed by kind, in the order the table returned them', async () => {
    events = [
      { id: 1, user_id: USER_ID, kind: 'clue', took_turn: false, created_at: 't1',
        turn_number: 1, seat: 'A', clue_word: 'TOOLS', clue_count: 2, clue_from_ai: false,
        guess_position: null, guess_result: null },
      { id: 2, user_id: 'peer', kind: 'guess', took_turn: false, created_at: 't2',
        turn_number: 1, seat: 'B', clue_word: null, clue_count: null, clue_from_ai: null,
        guess_position: 4, guess_result: 'G' },
    ]
    const { result } = renderHook(() => useBoard(GAME_ID, USER_ID, false))

    await waitFor(() => expect(result.current.loading).toBe(false))
    expect(result.current.events).toEqual([
      { id: 1, user_id: USER_ID, kind: 'clue', took_turn: false, created_at: 't1',
        turn_number: 1, seat: 'A', clue_word: 'TOOLS', clue_count: 2, clue_from_ai: false },
      { id: 2, user_id: 'peer', kind: 'guess', took_turn: false, created_at: 't2',
        turn_number: 1, seat: 'B', guess_position: 4, guess_result: 'G' },
    ])
  })

  it('exposes the peer key only when revealPeer is true — from the single load, no second fetch', async () => {
    const { result, rerender } = renderHook(
      ({ revealPeer }: { revealPeer: boolean }) => useBoard(GAME_ID, USER_ID, revealPeer),
      { initialProps: { revealPeer: false } },
    )

    // Wait for initial load to settle.
    await waitFor(() => expect(result.current.loading).toBe(false))
    expect(result.current.peerKey).toBeNull()

    // The player shows the key → revealPeer flips true → the peer key (loaded
    // with the same games row, held back by the derivation) appears.
    rerender({ revealPeer: true })
    await waitFor(() => expect(result.current.peerKey).toEqual(peerKey))

    // The peer key rides along on the ONE games row the main load already
    // reads, so revealing it must not trigger a second `.from('games')`
    // round-trip.
    const gamesFetches = mockFrom.mock.calls.filter(([table]) => table === 'games')
    expect(gamesFetches).toHaveLength(1)
  })

  it('clears the peer key when revealPeer flips back to false', async () => {
    // The player hides the partner's key again: peerKey must clear.
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

  it('clears my key when a refetch finds the game row gone — the no-such-game path', async () => {
    const { result } = renderHook(() => useBoard(GAME_ID, USER_ID, false))
    await waitFor(() => expect(result.current.myKey).toEqual(ownKey))

    gameGone = true
    await act(async () => {
      onStatus!('SUBSCRIBED')
    })
    await waitFor(() => expect(result.current.myKey).toBeNull())
    expect(result.current.failure).toBeNull()
  })

  it('keeps the envelope of a failed read instead of an empty board', async () => {
    // The words read dies. An empty `words` is what a caller would otherwise
    // see — indistinguishable from a board that legitimately has nothing on it
    // — so the hook has to hand back the envelope as its own answer.
    mockFrom.mockImplementation((table: string) => {
      const chain: Record<string, unknown> = {
        select() { return chain },
        eq() {
          return table === 'words' || table === 'events'
            ? chain
            : Promise.resolve({ data: [], error: null })
        },
        order() {
          return Promise.resolve({
            data: null,
            error: { message: 'connection refused' },
            status: 500,
          })
        },
      }
      return chain
    })

    const { result } = renderHook(() => useBoard(GAME_ID, USER_ID, false))

    await waitFor(() => expect(result.current.loading).toBe(false))
    expect(result.current.failure?.type).toBe('not-ok')
    // Always a FAULT: `readRows` never authors anything else.
    expect(result.current.failure?.severity).toBe('fault')
    // And the board is left with nothing to draw rather than a half-load.
    expect(result.current.words).toHaveLength(0)
    expect(result.current.myKey).toBeNull()
  })
})
