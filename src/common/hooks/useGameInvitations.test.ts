/**
 * Tests for useGameInvitations — specifically the "entering the invited
 * game dismisses the popup for good" behavior.
 *
 * The regression this guards: the popup's `pending` state was only
 * cleared by the dialog's own Join/dismiss. Entering the game any other
 * way (the club's active-game card — a plain <Link> — a shared URL, the
 * back button) merely VIEW-FILTERED the current game out, so the invite
 * stayed in `pending` and re-appeared the moment you navigated away. The
 * fix removes a matching invite from `pending` whenever the current path
 * is that game, making the dismissal durable across later navigations.
 *
 * Mocking strategy mirrors useSession.test.ts: vi.hoisted() spies, a
 * module-level `mockPath` the mocked `usePath` returns (changed + a
 * `rerender()` to simulate navigation), and per-table thenable builders
 * for the db so `load()` surfaces exactly one invite.
 */

import { renderHook, act, waitFor } from '@testing-library/react'
import type { Session } from '@supabase/supabase-js'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const { mockChannel, mockRemoveChannel, mockNavigate } = vi.hoisted(() => ({
  mockChannel: vi.fn(),
  mockRemoveChannel: vi.fn(),
  mockNavigate: vi.fn(),
}))

// The "current URL" the mocked usePath returns. Tests mutate it then
// rerender() to simulate a navigation.
let mockPath = '/c/pals'

vi.mock('../lib/supabase', () => ({
  supabase: { channel: mockChannel, removeChannel: mockRemoveChannel },
}))

vi.mock('../lib/router', () => ({
  navigate: mockNavigate,
  usePath: () => mockPath,
}))

vi.mock('../lib/channelDedup', () => ({ channelDedupSuffix: () => 'test' }))

vi.mock('../../games', () => ({
  games: [{ gametype: 'spellingbee_coop', name: 'Test Game' }],
}))

// A real game id is a hex UUID — the path regex only captures `[0-9a-f-]+`,
// so the test id must be UUID-shaped or currentGameId won't match it.
const GID = '11111111-1111-1111-1111-111111111111'

// Per-table db results. `load()` runs three queries (game_players → games
// → profiles); each builder is a thenable resolving to its table's rows.
const dbData: Record<string, unknown[]> = {
  game_players: [{ game_id: GID }],
  games: [
    { id: GID, gametype: 'spellingbee_coop', club_handle: 'pals', created_by: 'moth-id' },
  ],
  profiles: [{ user_id: 'moth-id', username: 'moth' }],
}

vi.mock('../db', () => {
  const make = (table: string) => {
    const b: {
      select: () => typeof b
      eq: () => typeof b
      in: () => typeof b
      then: (resolve: (v: { data: unknown[]; error: null }) => void) => void
    } = {
      select: () => b,
      eq: () => b,
      in: () => b,
      then: (resolve) => resolve({ data: dbData[table], error: null }),
    }
    return b
  }
  return { db: { from: (t: string) => make(t) } }
})

// Keep the real (pure) newInviteCandidates; stub the localStorage-backed
// seen-set helpers (no localStorage in the test env).
vi.mock('../lib/gameInvites', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../lib/gameInvites')>()
  return { ...actual, loadSeenInvites: () => new Set<string>(), markInviteSeen: vi.fn() }
})

import { useGameInvitations } from './useGameInvitations'

const session = { user: { id: 'me-id' } } as unknown as Session

// Captures the channel's subscribe callback so a test can fire SUBSCRIBED
// (which triggers the hook's load()).
let subscribeCb: ((status: string) => void) | null = null

beforeEach(() => {
  mockPath = '/c/pals'
  subscribeCb = null
  mockChannel.mockImplementation(() => {
    const ch: { on: () => typeof ch; subscribe: (cb: (s: string) => void) => typeof ch } = {
      on: () => ch,
      subscribe: (cb) => {
        subscribeCb = cb
        return ch
      },
    }
    return ch
  })
})

afterEach(() => vi.clearAllMocks())

/** Render the hook and drive the SUBSCRIBED → load() path so the single
 *  mocked invite is surfaced. Returns renderHook's handle. */
async function renderWithInvite() {
  const handle = renderHook(() => useGameInvitations(session))
  await act(async () => {
    subscribeCb?.('SUBSCRIBED')
  })
  await waitFor(() =>
    expect(handle.result.current.invites.map((i) => i.gameId)).toEqual([GID]),
  )
  return handle
}

describe('useGameInvitations', () => {
  it('surfaces an invite for a game a friend added me to', async () => {
    const { result } = await renderWithInvite()
    expect(result.current.invites[0]).toMatchObject({
      gameId: GID,
      gametype: 'spellingbee_coop',
      gameName: 'Test Game',
      inviterName: 'moth',
    })
  })

  it('hides the invite while viewing that game, and keeps it gone after navigating away', async () => {
    const { result, rerender } = await renderWithInvite()

    // Enter the game by the active-game link (a navigation, not the
    // dialog's Join) — the popup must hide.
    await act(async () => {
      mockPath = `/g/spellingbee_coop/${GID}`
      rerender()
    })
    expect(result.current.invites).toEqual([])

    // Navigate back to the club. Pre-fix this re-showed the invite (the
    // suppression was render-only); now it must stay dismissed.
    await act(async () => {
      mockPath = '/c/pals'
      rerender()
    })
    expect(result.current.invites).toEqual([])
  })

  it('still shows the invite across an unrelated navigation (not the game)', async () => {
    const { result, rerender } = await renderWithInvite()

    // Moving between non-game pages must NOT dismiss it.
    await act(async () => {
      mockPath = '/'
      rerender()
    })
    expect(result.current.invites.map((i) => i.gameId)).toEqual([GID])
  })

  it('dismiss() removes the invite', async () => {
    const { result } = await renderWithInvite()
    act(() => result.current.dismiss(GID))
    expect(result.current.invites).toEqual([])
  })
})
