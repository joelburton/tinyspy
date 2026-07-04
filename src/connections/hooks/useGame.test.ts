/**
 * Realtime-channel lifecycle tests for connections' useGame.
 *
 * The game joins ONE Supabase Realtime room per game, named
 * `connections:<gameId>` — deliberately stable so all coop peers share
 * a selection-Broadcast room. Because the effect owns a real channel
 * (it tears the old one down via `removeChannel` and resubscribes on
 * re-run), its dependency array is load-bearing: it must react to the
 * inputs the room is actually keyed on (`gameId`) and NOT to values the
 * effect body never reads.
 *
 * The guarded contract: the room is game-scoped, so a new `Session`
 * object (what a routine JWT refresh hands React) must NOT rebuild it —
 * even if the user id itself differs. `gameId` changing, on the other
 * hand, MUST rebuild it. See the `[applySelection, gameId]` deps in the
 * hook.
 */

import { renderHook } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { Session } from '@supabase/supabase-js'

const { mockFrom, mockChannel, mockRemoveChannel } = vi.hoisted(() => ({
  mockFrom: vi.fn(),
  mockChannel: vi.fn(),
  mockRemoveChannel: vi.fn(),
}))

vi.mock('../../common/lib/supabase/supabase', () => ({
  supabase: {
    // connections' `db` is `supabase.schema('connections')`; collapse
    // .schema() to a passthrough exposing the chainable mockFrom.
    schema: () => ({ from: mockFrom }),
    from: mockFrom,
    channel: mockChannel,
    removeChannel: mockRemoveChannel,
  },
}))

import { useGame } from './useGame'

const GAME_ID = '00000000-0000-0000-0000-0000000000a1'
const OTHER_GAME_ID = '00000000-0000-0000-0000-0000000000a2'

/** A brand-new Session object each call — mirrors what Supabase hands
 *  React on a token refresh. Only `user.id` is read by the hook. */
function sessionFor(userId: string): Session {
  return { user: { id: userId } } as unknown as Session
}

// The hook chains `.channel(name).on(...)×4.subscribe(cb)`; subscribe's
// callback (which would fire the initial `load`) is intentionally NOT
// invoked here — these tests assert channel lifecycle, not data load,
// so no `db.from(...)` query needs to resolve.
const channelChain = {
  on: vi.fn(function () {
    return channelChain
  }),
  subscribe: vi.fn(function () {
    return channelChain
  }),
}
// Reset call counts BEFORE each test rather than after: testing-library
// auto-unmounts the previous test's hook during teardown, and that
// unmount fires the effect cleanup (one `removeChannel`). Clearing in
// beforeEach zeroes the counters after that teardown, so a prior test's
// cleanup can't leak into this one's assertions.
beforeEach(() => {
  vi.clearAllMocks()
  mockChannel.mockReturnValue(channelChain)
})

describe('useGame — Realtime channel lifecycle', () => {
  it('does not rebuild the channel when only the session identity changes', () => {
    const { rerender } = renderHook(
      ({ session }: { session: Session }) => useGame(session, GAME_ID),
      { initialProps: { session: sessionFor('u1') } },
    )
    expect(mockChannel).toHaveBeenCalledTimes(1)
    expect(mockChannel).toHaveBeenCalledWith(`connections:${GAME_ID}`)
    expect(mockRemoveChannel).not.toHaveBeenCalled()

    // A token refresh hands React a fresh Session object. Even a
    // different user id must NOT tear the game-scoped room down —
    // regression guard for a spurious `session.user.id` in the deps.
    rerender({ session: sessionFor('u2') })
    expect(mockChannel).toHaveBeenCalledTimes(1)
    expect(mockRemoveChannel).not.toHaveBeenCalled()
  })

  it('rebuilds the channel when gameId changes', () => {
    const { rerender } = renderHook(
      ({ gameId }: { gameId: string }) => useGame(sessionFor('u1'), gameId),
      { initialProps: { gameId: GAME_ID } },
    )
    expect(mockChannel).toHaveBeenCalledTimes(1)

    // gameId IS read by the effect (query filters + channel name), so a
    // change must tear the old room down and open the new one — proves
    // the tightened deps still react to their real input.
    rerender({ gameId: OTHER_GAME_ID })
    expect(mockRemoveChannel).toHaveBeenCalledTimes(1)
    expect(mockChannel).toHaveBeenCalledTimes(2)
    expect(mockChannel).toHaveBeenLastCalledWith(`connections:${OTHER_GAME_ID}`)
  })
})
