/**
 * Tests for makeFoundWordsGame — the useGame data-hook factory shared by
 * spellingbee + wordwheel (their hook bodies were byte-identical). Two data
 * lifecycles ride on it and both hit every consumer at once if they break:
 *   - the immutable HEADER loads ONCE from the games_state view (not per event,
 *     or the word lists re-download on every teammate submission);
 *   - found_words refetches through useRealtimeRefetch, subscribing to BOTH
 *     found_words AND games (the games line is the replay_board realtime touch),
 *     and honouring the mounted() guard.
 *
 * supabase's schema-scoped chain and useRealtimeRefetch are mocked; the test
 * drives the captured `load` directly (the real hook runs it on mount/subscribe).
 */

import { renderHook, waitFor, act } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const { headerResult, rowsResult, fromMock, schemaMock, refetchMock } = vi.hoisted(() => ({
  headerResult: { value: null as Record<string, unknown> | null },
  rowsResult: { value: null as Record<string, unknown>[] | null },
  fromMock: vi.fn(),
  schemaMock: vi.fn(),
  refetchMock: vi.fn(),
}))

vi.mock('../../lib/supabase/supabase', () => {
  const chain = {
    select: vi.fn(() => chain),
    eq: vi.fn(() => chain),
    maybeSingle: vi.fn(async () => ({ data: headerResult.value })),
    order: vi.fn(async () => ({ data: rowsResult.value })),
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

vi.mock('../realtime/useRealtimeRefetch', () => ({
  useRealtimeRefetch: (config: unknown) => refetchMock(config),
}))

import { makeFoundWordsGame } from './makeFoundWordsGame'

// The factory param is a schema-name union; spellingbee is a real member.
const useFoundWordsGame = makeFoundWordsGame('spellingbee')

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
  fromMock.mockClear()
  schemaMock.mockClear()
  refetchMock.mockClear()
})

describe('makeFoundWordsGame — header', () => {
  it('scopes the client to the given schema at factory-build time', () => {
    // schema() is called once when the factory is built (not per render), so
    // build a fresh one here (beforeEach cleared the module-load call).
    makeFoundWordsGame('wordwheel')
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

    const { result } = renderHook(() => useFoundWordsGame('g1'))
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
    const { result } = renderHook(() => useFoundWordsGame('missing'))
    await waitFor(() => expect(result.current.loading).toBe(false))
    expect(result.current.game).toBeNull()
  })

  it('defaults the word lists to [] when the columns are null', async () => {
    headerResult.value = {
      id: 'g1', club_handle: 'c', mode: 'compete', outer_letters: 'cabdon',
      center_letter: 'e', required_words_score: 0, required_words_count: 0,
      created_at: 'x', required_words: null, bonus_words: null,
    }
    const { result } = renderHook(() => useFoundWordsGame('g1'))
    await waitFor(() => expect(result.current.game).not.toBeNull())
    expect(result.current.game!.requiredWords).toEqual([])
    expect(result.current.game!.bonusWords).toEqual([])
  })
})

describe('makeFoundWordsGame — found_words realtime', () => {
  it('subscribes to BOTH found_words and games with the game-scoped filters', () => {
    renderHook(() => useFoundWordsGame('g7'))
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
    const { result } = renderHook(() => useFoundWordsGame('g1'))
    await waitFor(() => expect(result.current.loading).toBe(false))
    expect(result.current.rowsLoaded).toBe(false) // load hasn't run yet (mock doesn't auto-run it)

    await act(async () => { await lastConfig().load({ mounted: () => true }) })

    expect(fromMock).toHaveBeenCalledWith('found_words')
    expect(result.current.foundWords).toHaveLength(1)
    expect(result.current.foundWords[0].word).toBe('bead')
    expect(result.current.rowsLoaded).toBe(true)
  })

  it('honours the mounted() guard — a superseded load never commits', async () => {
    rowsResult.value = [
      { game_id: 'g1', user_id: 'u1', word: 'bead', points: 1, is_pangram: false, is_bonus: false, found_at: 't1' },
    ]
    const { result } = renderHook(() => useFoundWordsGame('g1'))
    await waitFor(() => expect(result.current.loading).toBe(false))

    await act(async () => { await lastConfig().load({ mounted: () => false }) })

    expect(result.current.foundWords).toEqual([])
    expect(result.current.rowsLoaded).toBe(false)
  })
})
