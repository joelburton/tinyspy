// cs-met-bee-games

/**
 * Tests for makeBeeGame — the useGame data-hook factory shared by
 * spellingbee + wordwheel (their hook bodies were byte-identical). Two data
 * lifecycles ride on it and both hit every consumer at once if they break:
 *   - the immutable HEADER loads ONCE from the games_state view (not per event,
 *     or the word lists re-download on every teammate submission);
 *   - found_words refetches through useRealtimeRefetch, subscribing to BOTH
 *     found_words AND games (the games line is the replay_board realtime touch),
 *     and honoring the mounted() guard.
 *
 * supabase's schema-scoped chain and useRealtimeRefetch are mocked; the test
 * drives the captured `load` directly (the real hook runs it on mount/subscribe).
 */

import { renderHook, waitFor, act } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const { headerResult, rowsResult, headerError, rowsError, fromMock, schemaMock, refetchMock } =
  vi.hoisted(() => ({
    headerResult: { value: null as Record<string, unknown> | null },
    rowsResult: { value: null as Record<string, unknown>[] | null },
    // Either read can be made to fail. `readRows` folds a PostgREST `error`
    // into a fault envelope, so `details` is what comes back out in `detail` —
    // which is how a case tells the two failures apart below.
    headerError: { value: null as { message: string; details: string } | null },
    rowsError: { value: null as { message: string; details: string } | null },
    fromMock: vi.fn(),
    schemaMock: vi.fn(),
    refetchMock: vi.fn(),
  }))

vi.mock('@/common/supabase/supabase', () => {
  // `.eq()` is BOTH awaitable and chainable, which is what separates the two
  // lifecycles now that neither ends in `.maybeSingle()`: the header awaits it
  // directly and gets the game row (as ROWS — 0 or 1, since `id` is the PK),
  // while the found list calls `.order()` first and gets the word rows.
  const eqResult = {
    then: (resolve: (r: unknown) => unknown) =>
      resolve(
        headerError.value
          ? { data: null, error: headerError.value }
          : { data: headerResult.value ? [headerResult.value] : [], error: null },
      ),
    order: vi.fn(async () =>
      rowsError.value
        ? { data: null, error: rowsError.value }
        : { data: rowsResult.value, error: null },
    ),
  }
  const chain = {
    select: vi.fn(() => chain),
    eq: vi.fn(() => eqResult),
  }
  const from = (table: string) => {
    fromMock(table)
    return chain
  }
  return {
    supabase: {
      schema: (name: string) => {
        schemaMock(name)
        return { from }
      },
    },
  }
})

vi.mock('@/common/realtime/useRealtimeRefetch', () => ({
  useRealtimeRefetch: (config: unknown) => refetchMock(config),
}))

import { clearFaultsForTest } from '@/common/faults/faultStore'
import { makeBeeGame } from './makeBeeGame'

// The factory param is a schema-name union; spellingbee is a real member.
const useBeeGame = makeBeeGame('spellingbee')

/** The captured useRealtimeRefetch config from the most recent render. */
type RefetchConfig = {
  tables: Array<{ schema: string; table: string; filter: string }>
  channelPrefix: string
  id: string
  load: (ctx: { mounted: () => boolean }) => Promise<void>
}
const lastConfig = () => refetchMock.mock.calls.at(-1)![0] as RefetchConfig

beforeEach(() => {
  headerResult.value = null
  rowsResult.value = null
  headerError.value = null
  rowsError.value = null
  fromMock.mockClear()
  schemaMock.mockClear()
  refetchMock.mockClear()
  // A failed read raises the fault modal centrally, so the cases below leave
  // one behind; clearing keeps them independent.
  clearFaultsForTest()
})

describe('makeBeeGame — header', () => {
  it('scopes the client to the given schema at factory-build time', () => {
    // schema() is called once when the factory is built (not per render), so
    // build a fresh one here (beforeEach cleared the module-load call).
    makeBeeGame('wordwheel')
    expect(schemaMock).toHaveBeenCalledWith('wordwheel')
  })

  it('loads the immutable header once from games_state and maps the word lists', async () => {
    headerResult.value = {
      id: 'g1',
      club_handle: 'club',
      mode: 'coop',
      outer_letters: 'cabdon',
      center_letter: 'e',
      required_words_score: 42,
      required_words_count: 3,
      created_at: '2026-07-13T00:00:00Z',
      required_words: [{ word: 'bead', points: 1, is_pangram: false }],
      bonus_words: [{ word: 'acned', points: 5, is_pangram: false }],
    }

    const { result } = renderHook(() => useBeeGame('g1'))
    expect(result.current.loading).toBe(true) // header not yet resolved

    await waitFor(() => expect(result.current.loading).toBe(false))
    expect(fromMock).toHaveBeenCalledWith('games_state')
    expect(result.current.game).toMatchObject({
      id: 'g1',
      mode: 'coop',
      required_words_score: 42,
      requiredWords: [{ word: 'bead', points: 1, is_pangram: false }],
      bonusWords: [{ word: 'acned', points: 5, is_pangram: false }],
    })
  })

  it('leaves game null but still clears loading when the header is missing', async () => {
    headerResult.value = null
    const { result } = renderHook(() => useBeeGame('missing'))
    await waitFor(() => expect(result.current.loading).toBe(false))
    expect(result.current.game).toBeNull()
  })

  it('surfaces a failed header read, and stops loading — it is never retried', async () => {
    // A failed read is NOT a missing game: `game` is null either way, and only
    // one of them means there is nothing to play. The surface reads `failure`
    // to tell them apart.
    headerError.value = { message: 'boom', details: 'header-boom' }
    const { result } = renderHook(() => useBeeGame('g1'))

    await waitFor(() => expect(result.current.loading).toBe(false))
    expect(result.current.failure?.detail).toContain('header-boom')
    expect(result.current.game).toBeNull()
  })

  it("keeps the header's failure even after a rows load succeeds", async () => {
    // The reason there are TWO failure slots. The header is fetched once and
    // never retried, so its failure is permanent; the found list refetches on
    // every event. Sharing one slot would let this good refetch erase a
    // failure that is still true, and the board would look fine with no board.
    headerError.value = { message: 'boom', details: 'header-boom' }
    rowsResult.value = []
    const { result } = renderHook(() => useBeeGame('g1'))
    await waitFor(() => expect(result.current.failure).not.toBeNull())

    await act(async () => { await lastConfig().load({ mounted: () => true }) })

    expect(result.current.rowsLoaded).toBe(true) // the rows really did load
    expect(result.current.failure?.detail).toContain('header-boom')
  })

  it("reports the HEADER's failure when both reads have failed", async () => {
    // Which one is reported decides which read the diagnostic names, and that
    // is the fact nobody can recover afterwards. The header's wins because it
    // is never retried: once it has failed the board is not coming back,
    // however the found list is doing.
    headerError.value = { message: 'boom', details: 'header-boom' }
    rowsError.value = { message: 'boom', details: 'rows-boom' }
    const { result } = renderHook(() => useBeeGame('g1'))
    await waitFor(() => expect(result.current.failure).not.toBeNull())

    await act(async () => { await lastConfig().load({ mounted: () => true }) })

    expect(result.current.failure?.detail).toContain('header-boom')
  })

  it('defaults the word lists to [] when the columns are null', async () => {
    headerResult.value = {
      id: 'g1', club_handle: 'c', mode: 'compete', outer_letters: 'cabdon',
      center_letter: 'e', required_words_score: 0, required_words_count: 0,
      created_at: 'x', required_words: null, bonus_words: null,
    }
    const { result } = renderHook(() => useBeeGame('g1'))
    await waitFor(() => expect(result.current.game).not.toBeNull())
    expect(result.current.game!.requiredWords).toEqual([])
    expect(result.current.game!.bonusWords).toEqual([])
  })
})

describe('makeBeeGame — found_words realtime', () => {
  it('subscribes to BOTH found_words and games with the game-scoped filters', () => {
    renderHook(() => useBeeGame('g7'))
    const cfg = lastConfig()
    expect(cfg.channelPrefix).toBe('spellingbee')
    expect(cfg.id).toBe('g7')
    expect(cfg.tables).toEqual([
      { schema: 'spellingbee', table: 'found_words', filter: 'game_id=eq.g7' },
      { schema: 'spellingbee', table: 'games', filter: 'id=eq.g7' },
    ])
  })

  it('the load populates foundWords + rowsLoaded from found_words', async () => {
    rowsResult.value = [
      { game_id: 'g1', user_id: 'u1', word: 'bead', points: 1, is_pangram: false, is_bonus: false, found_at: 't1' },
    ]
    const { result } = renderHook(() => useBeeGame('g1'))
    await waitFor(() => expect(result.current.loading).toBe(false))
    expect(result.current.rowsLoaded).toBe(false) // load hasn't run yet (mock doesn't auto-run it)

    await act(async () => { await lastConfig().load({ mounted: () => true }) })

    expect(fromMock).toHaveBeenCalledWith('found_words')
    expect(result.current.foundWords).toHaveLength(1)
    expect(result.current.foundWords[0].word).toBe('bead')
    expect(result.current.rowsLoaded).toBe(true)
  })

  it('surfaces a failed rows read, and a load that WORKS clears it', async () => {
    rowsError.value = { message: 'boom', details: 'rows-boom' }
    const { result } = renderHook(() => useBeeGame('g1'))
    await waitFor(() => expect(result.current.loading).toBe(false))

    await act(async () => { await lastConfig().load({ mounted: () => true }) })
    expect(result.current.failure?.detail).toContain('rows-boom')

    // This list refetches on every realtime event, so an outage that ends has
    // to take its sentence with it — otherwise the surface sits behind an
    // explanation that stopped being true.
    rowsError.value = null
    rowsResult.value = []
    await act(async () => { await lastConfig().load({ mounted: () => true }) })
    expect(result.current.failure).toBeNull()
  })

  it('honors the mounted() guard — a superseded load never commits', async () => {
    rowsResult.value = [
      { game_id: 'g1', user_id: 'u1', word: 'bead', points: 1, is_pangram: false, is_bonus: false, found_at: 't1' },
    ]
    const { result } = renderHook(() => useBeeGame('g1'))
    await waitFor(() => expect(result.current.loading).toBe(false))

    await act(async () => { await lastConfig().load({ mounted: () => false }) })

    expect(result.current.foundWords).toEqual([])
    expect(result.current.rowsLoaded).toBe(false)
  })
})
