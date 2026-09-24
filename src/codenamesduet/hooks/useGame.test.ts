// cs-blessed-codenamesduet

/**
 * What the game-row read becomes, and what a missing or failed one leaves
 * behind. The subscription is `useRealtimeRefetch`'s and is stubbed so the
 * refetch body can be run on demand; the body is this hook's own.
 *
 * An absent game and a failed read both leave `game` null, and only `failure`
 * tells the loader which page to draw.
 */

import { act, renderHook } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { Envelope } from '@/common/supabase/envelope'

const { mockReadRows, refetch } = vi.hoisted(() => ({
  mockReadRows: vi.fn(),
  // The `load` the hook hands `useRealtimeRefetch`, kept so a test can run it.
  refetch: { load: null as ((a: { mounted: () => boolean }) => Promise<void>) | null },
}))

// A query builder that answers every chained call with itself — `readRows` is
// mocked, so the chain only has to survive being built.
vi.mock('../db', () => {
  const chain: unknown = new Proxy({}, { get: () => () => chain })
  return { db: { from: () => chain } }
})

vi.mock('@/common/realtime/useRealtimeRefetch', () => ({
  useRealtimeRefetch: (opts: { load: (a: { mounted: () => boolean }) => Promise<void> }) => {
    refetch.load = opts.load
  },
}))

vi.mock('@/common/supabase/dbResult', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/common/supabase/dbResult')>()),
  readRows: mockReadRows,
}))

import { useGame } from './useGame'

function ok<T>(data: T): Envelope<T> {
  return {
    type: 'ok', data, severity: null, field: null, meta: null,
    dbcode: null, detail: null, message: null, outcome: null,
  }
}

function readFailed(): Envelope<never> {
  return {
    type: 'not-ok', data: null, outcome: null, severity: 'fault',
    message: 'The game could not be loaded.', field: null, meta: null,
    dbcode: 'PGRST000', detail: null,
  }
}

const ROW = { turn_number: 3, current_clue_giver: 'B', user_a_id: 'ada', user_b_id: 'bea' }

/** Mount, and hand back the hook's result plus a way to run one refetch. */
function mount() {
  const view = renderHook(() => useGame('g1'))
  const refetchNow = () =>
    act(async () => {
      await refetch.load!({ mounted: () => true })
    })
  return { result: view.result, refetchNow }
}

beforeEach(() => {
  vi.clearAllMocks()
  refetch.load = null
})

describe('codenamesduet useGame', () => {
  it('loads the row and stops loading', async () => {
    mockReadRows.mockResolvedValue(ok([ROW]))
    const { result, refetchNow } = mount()
    await refetchNow()
    expect(result.current).toEqual({ game: ROW, loading: false, failure: null })
  })

  it('drops the old game when a refetch finds no row, rather than drawing it on', async () => {
    const { result, refetchNow } = mount()
    mockReadRows.mockResolvedValueOnce(ok([ROW]))
    await refetchNow()
    mockReadRows.mockResolvedValueOnce(ok([]))
    await refetchNow()
    expect(result.current.game).toBeNull()
    expect(result.current.failure).toBeNull()
  })

  it('keeps a failed read’s envelope, and a later good load clears it', async () => {
    const { result, refetchNow } = mount()
    mockReadRows.mockResolvedValueOnce(readFailed())
    await refetchNow()
    expect(result.current.failure?.dbcode).toBe('PGRST000')
    expect(result.current.loading).toBe(false)
    mockReadRows.mockResolvedValueOnce(ok([ROW]))
    await refetchNow()
    expect(result.current.failure).toBeNull()
    expect(result.current.game).toEqual(ROW)
  })
})
