// cs-blessed-common-hosts

/**
 * Tests for useGameInvitations — specifically that entering the invited game
 * dismisses the invite for good.
 *
 * Entering the game by any route other than the toast's own Join — the club's
 * active-game card (a plain <Link>), a shared URL, the back button — has to
 * remove the invite from `pending`, not merely hide it while the URL is that
 * game. Hidden-only, it would come back the moment you navigated away. The
 * hook's docstring says which lines carry that.
 *
 * Mocking strategy mirrors useSession.test.ts: vi.hoisted() spies, a
 * module-level `mockPath` the mocked `usePath` returns (changed + a
 * `rerender()` to simulate navigation), and per-table thenable builders
 * for the db so `load()` surfaces exactly one invite.
 */

import { renderHook, act, waitFor } from '@testing-library/react'
import type { Session } from '@supabase/supabase-js'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const { mockChannel, mockRemoveChannel, mockNavigate, mockReportUnknown, REGISTRY } = vi.hoisted(() => ({
  mockReportUnknown: vi.fn(),
  REGISTRY: [{ gametype: 'spellingbee_coop', name: 'Test Game' }],
  mockChannel: vi.fn(),
  mockRemoveChannel: vi.fn(),
  mockNavigate: vi.fn(),
}))

// The "current URL" the mocked usePath returns. Tests mutate it then
// rerender() to simulate a navigation.
let mockPath = '/c/pals'

vi.mock('../supabase/supabase', () => ({
  supabase: { channel: mockChannel, removeChannel: mockRemoveChannel },
}))

vi.mock('../routing/router', () => ({
  navigate: mockNavigate,
  usePath: () => mockPath,
}))

vi.mock('../realtime/channelDedup', () => ({ channelDedupSuffix: () => 'test' }))

// The registry AND its lookup, from one list: `manifestFor` reads the registry,
// so a mock supplying only the list would let the two disagree.
vi.mock('@/gametypes', () => ({
  gametypes: REGISTRY,
  manifestFor: (gametype: string) => REGISTRY.find((g) => g.gametype === gametype),
}))
vi.mock('../manifest/unknownGametype', () => ({
  reportUnknownGametypes: mockReportUnknown,
}))

// A real game id is a hex UUID, and the mocked path below is built to look
// like one so the "already looking at it" comparison reads realistically.
const GID = '11111111-1111-1111-1111-111111111111'

// Per-table db results. `load()` runs two queries: game_players (with
// an `!inner` embed of the game, filtered to non-terminal) → profiles. Each
// builder is a thenable resolving to its table's rows. The game_players rows
// carry the embedded `games` object (to-one), matching the query shape.
const dbData: Record<string, unknown[]> = {
  game_players: [
    {
      games: {
        id: GID,
        gametype: 'spellingbee_coop',
        club_handle: 'pals',
        created_by: 'moth-id',
      },
    },
  ],
  profiles: [{ user_id: 'moth-id', username: 'moth' }],
}

/** Every `.gt(col, value)` the hook applied, so a test can assert the
 *  invitation scan is bounded by age and not just by `is_terminal`. */
const gtCalls: [string, string][] = []

vi.mock('../supabase/db', () => {
  const make = (table: string) => {
    const b: {
      select: () => typeof b
      eq: () => typeof b
      gt: (col: string, value: string) => typeof b
      in: () => typeof b
      then: (resolve: (v: { data: unknown[]; error: null }) => void) => void
    } = {
      select: () => b,
      eq: () => b,
      gt: (col, value) => {
        gtCalls.push([col, value])
        return b
      },
      in: () => b,
      then: (resolve) => resolve({ data: dbData[table], error: null }),
    }
    return b
  }
  return { db: { from: (t: string) => make(t) } }
})

// Keep the real (pure) newInviteCandidates; stub the localStorage-backed
// seen-set helpers (no localStorage in the test env).
vi.mock('./gameInvites', async (importOriginal) => {
  const actual = await importOriginal<typeof import('./gameInvites')>()
  return { ...actual, loadSeenInvites: () => new Set<string>(), markInviteSeen: vi.fn() }
})

import { useGameInvitations } from './useGameInvitations'
import { INVITE_MAX_AGE_MS } from './gameInvites'

const session = { user: { id: 'me-id' } } as unknown as Session

// Captures the channel's subscribe callback so a test can fire SUBSCRIBED
// (which triggers the hook's load()).
let subscribeCb: ((status: string) => void) | null = null

const DEFAULT_GAME_PLAYERS = dbData.game_players

beforeEach(() => {
  mockPath = '/c/pals'
  subscribeCb = null
  // Restored because a test that wants an unknown gametype swaps it out.
  dbData.game_players = DEFAULT_GAME_PLAYERS
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

    // Enter the game by the active-game link (a navigation, not the toast's
    // own Join) — the invite must hide.
    await act(async () => {
      mockPath = `/g/spellingbee_coop/${GID}`
      rerender()
    })
    expect(result.current.invites).toEqual([])

    // Navigate back to the club. The dismissal has to be durable, not just a
    // render-time suppression of the game you are looking at.
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

  it('reports an invite for a gametype this bundle does not have, and drops it', async () => {
    // The row's gametype is one the SERVER knows (it is a foreign key), so a
    // miss means this tab predates a deploy — and the player is silently short
    // an invitation until they reload, which is what the report is for.
    dbData.game_players = [
      {
        games: {
          id: GID,
          gametype: 'gametype_from_the_future',
          club_handle: 'pals',
          created_by: 'moth-id',
        },
      },
    ]
    const { result } = renderHook(() => useGameInvitations(session))
    await act(async () => {
      subscribeCb?.('SUBSCRIBED')
    })
    await waitFor(() => expect(mockReportUnknown).toHaveBeenCalled())
    expect(mockReportUnknown).toHaveBeenCalledWith(['gametype_from_the_future'])
    expect(result.current.invites).toEqual([])
  })

  it('dismiss() removes the invite', async () => {
    const { result } = await renderWithInvite()
    act(() => result.current.dismiss(GID))
    expect(result.current.invites).toEqual([])
  })
})

/**
 * The scan's age bound — load-bearing, because `is_terminal = false` is not a
 * staleness bound. `INVITE_MAX_AGE_MS` says what goes wrong without it.
 */
describe('useGameInvitations — the backfill is bounded by age', () => {
  it('filters the scan on games.started_at, an hour back', async () => {
    gtCalls.length = 0
    const before = Date.now()
    await renderWithInvite()
    const after = Date.now()

    const [col, value] = gtCalls.find(([c]) => c === 'games.started_at') ?? []
    expect(col).toBe('games.started_at')

    // The cutoff is "an hour ago" measured at query time — bracketed rather
    // than compared to a fixed instant, since the clock moves during the test.
    const cutoff = new Date(value!).getTime()
    expect(cutoff).toBeGreaterThanOrEqual(before - INVITE_MAX_AGE_MS)
    expect(cutoff).toBeLessThanOrEqual(after - INVITE_MAX_AGE_MS)
  })
})
