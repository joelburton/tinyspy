/**
 * Tests for useCells — the per-cell "newer wins" reconciliation hook that
 * backs the crossword grid. This is the plan's explicitly "new,
 * separately-tested" code: it replaces the repo's default
 * refetch-the-whole-picture pattern with a direct per-row CDC apply guarded
 * by a per-cell `version`. The four behaviors pinned here are the ones the
 * 2026-07-05 review flagged as unpinned:
 *
 *   1. newer-wins CDC apply (an event no newer than local is dropped —
 *      which is also how our own optimistic echo gets absorbed);
 *   2. optimistic echo + adoption of the RPC's authoritative version;
 *   3. the C2 error-path ROLLBACK (a failed set_cell must not strand a
 *      wrong letter at the server's own version — that cell would be
 *      unrepairable under the strict `>` merge), plus its version guard
 *      (a newer write landing mid-RPC must survive the rollback);
 *   4. the compete privacy drop (`isMine`) — a CDC row for someone else's
 *      grid is dropped before it touches state, because privacy here is the
 *      RLS-filtered read, not Realtime withholding the row off the wire.
 *
 * The supabase client is mocked at the module boundary: `../db` for the
 * load query + the set_cell RPC, and the shared client for the Realtime
 * channel. The channel mock captures the CDC handler and the subscribe
 * callback so tests can drive events + the initial load by hand.
 */

import { renderHook, act, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { SetCellResult, SetMarkResult } from './useCells'

const { mockFrom, mockRpc, mockChannel, mockRemoveChannel } = vi.hoisted(() => ({
  mockFrom: vi.fn(),
  mockRpc: vi.fn(),
  mockChannel: vi.fn(),
  mockRemoveChannel: vi.fn(),
}))

vi.mock('../db', () => ({
  db: { from: mockFrom, rpc: mockRpc },
}))

vi.mock('../../common/lib/supabase/supabase', () => ({
  supabase: { channel: mockChannel, removeChannel: mockRemoveChannel },
}))

import { useCells, cellKey } from './useCells'

const GAME_ID = '00000000-0000-0000-0000-0000000000aa'
const ME = '00000000-0000-0000-0000-0000000000bb'
const OTHER = '00000000-0000-0000-0000-0000000000cc'

type CellRow = {
  owner_id: string | null
  row: number
  col: number
  fill: string | null
  pencil: boolean
  revealed: boolean
  wrong: boolean
  mark_right: 'break' | 'hyphen' | null
  mark_bottom: 'break' | 'hyphen' | null
  version: number
}

// A CDC payload row, defaulted so tests only specify what they care about.
function row(patch: Partial<CellRow>): CellRow {
  return {
    owner_id: null,
    row: 0,
    col: 0,
    fill: null,
    pencil: false,
    revealed: false,
    wrong: false,
    mark_right: null,
    mark_bottom: null,
    version: 0,
    ...patch,
  }
}

// Per-test control surface: the load() result, the captured CDC handler, and
// the captured subscribe callback (call it to fire the initial load).
let loadData: CellRow[] = []
let cdcHandler: ((payload: { new: CellRow }) => void) | null = null
let subscribeCb: ((status: string) => void) | null = null

function buildMocks() {
  loadData = []
  cdcHandler = null
  subscribeCb = null

  // db.from('cells').select(...).eq('game_id', id) → base; then base.is(...) or
  // base.eq('owner_id', id) is awaited. The first .eq (game_id) keeps chaining;
  // the second .eq / .is is the terminal that resolves the load rows.
  mockFrom.mockImplementation(() => {
    const base: Record<string, unknown> = {
      select: () => base,
      eq: (col: string) =>
        col === 'game_id' ? base : Promise.resolve({ data: loadData, error: null }),
      is: () => Promise.resolve({ data: loadData, error: null }),
    }
    return base
  })

  // ch = channel(name); ch.on(event, opts, handler) → ch; ch.subscribe(cb) → ch.
  mockChannel.mockImplementation(() => {
    const chain: Record<string, unknown> = {
      on: (_event: string, _opts: unknown, handler: (p: { new: CellRow }) => void) => {
        cdcHandler = handler
        return chain
      },
      subscribe: (cb: (status: string) => void) => {
        subscribeCb = cb
        return chain
      },
    }
    return chain
  })
  mockRemoveChannel.mockResolvedValue(undefined)
}

// Resolve the initial load (the hook only calls load() on SUBSCRIBED).
async function fireSubscribed(loading: () => boolean) {
  await act(async () => {
    subscribeCb?.('SUBSCRIBED')
  })
  await waitFor(() => expect(loading()).toBe(false))
}

function fireCdc(patch: Partial<CellRow>) {
  act(() => {
    cdcHandler?.({ new: row(patch) })
  })
}

// A manually-resolvable promise, for controlling RPC timing.
function deferred<T>() {
  let resolve!: (v: T) => void
  const promise = new Promise<T>((r) => {
    resolve = r
  })
  return { promise, resolve }
}

beforeEach(() => {
  buildMocks()
})

afterEach(() => {
  vi.clearAllMocks()
})

describe('useCells — CDC newer-wins', () => {
  it('applies a newer event and drops one that is not newer', async () => {
    loadData = [row({ owner_id: null, fill: 'A', version: 3 })]
    const { result } = renderHook(() => useCells(GAME_ID, null))
    await fireSubscribed(() => result.current.loading)
    expect(result.current.cells.get(cellKey(0, 0))?.fill).toBe('A')

    // Newer version → applied.
    fireCdc({ owner_id: null, fill: 'B', version: 4 })
    expect(result.current.cells.get(cellKey(0, 0))?.fill).toBe('B')

    // Equal version → dropped (this is exactly how our own optimistic echo is
    // absorbed once we've adopted the RPC's version).
    fireCdc({ owner_id: null, fill: 'X', version: 4 })
    expect(result.current.cells.get(cellKey(0, 0))?.fill).toBe('B')

    // Older version → dropped.
    fireCdc({ owner_id: null, fill: 'Y', version: 2 })
    expect(result.current.cells.get(cellKey(0, 0))?.fill).toBe('B')
  })
})

describe('useCells — optimistic setCell', () => {
  it('shows the fill immediately, then adopts the RPC version so the echo is a no-op', async () => {
    loadData = [row({ owner_id: null, fill: null, version: 1 })]
    const { result } = renderHook(() => useCells(GAME_ID, null))
    await fireSubscribed(() => result.current.loading)

    const d = deferred<{ data: { version: number; solved: boolean } | null; error: null }>()
    mockRpc.mockReturnValue({ single: () => d.promise })

    let call!: Promise<SetCellResult>
    act(() => {
      call = result.current.setCell(0, 0, 'Z', false)
    })
    // Optimistic: the letter is visible before the RPC resolves, still at the
    // pre-write version (1).
    expect(result.current.cells.get(cellKey(0, 0))?.fill).toBe('Z')
    expect(result.current.cells.get(cellKey(0, 0))?.version).toBe(1)

    await act(async () => {
      d.resolve({ data: { version: 7, solved: false }, error: null })
      await call
    })
    // Authoritative version adopted.
    expect(result.current.cells.get(cellKey(0, 0))?.version).toBe(7)

    // The server's own CDC echo (version 7) is now a no-op.
    fireCdc({ owner_id: null, fill: 'Z', version: 7 })
    expect(result.current.cells.get(cellKey(0, 0))?.fill).toBe('Z')
    expect(result.current.cells.get(cellKey(0, 0))?.version).toBe(7)
  })
})

describe('useCells — failed setCell rolls back (C2)', () => {
  it('reverts the optimistic write when the RPC errors', async () => {
    loadData = [row({ owner_id: null, fill: 'A', version: 3 })]
    const { result } = renderHook(() => useCells(GAME_ID, null))
    await fireSubscribed(() => result.current.loading)

    mockRpc.mockReturnValue({
      single: () => Promise.resolve({ data: null, error: { message: 'boom' } }),
    })

    let out!: SetCellResult
    await act(async () => {
      out = await result.current.setCell(0, 0, 'B', false)
    })
    expect(out).toEqual({ error: 'boom' })
    // The cell is back to its pre-write state — NOT stranded at 'B' version 3
    // (which the strict `>` merge could never repair).
    expect(result.current.cells.get(cellKey(0, 0))?.fill).toBe('A')
    expect(result.current.cells.get(cellKey(0, 0))?.version).toBe(3)
  })

  it('keeps a newer write that lands mid-RPC instead of rolling it back', async () => {
    loadData = [row({ owner_id: null, fill: 'A', version: 3 })]
    const { result } = renderHook(() => useCells(GAME_ID, null))
    await fireSubscribed(() => result.current.loading)

    const d = deferred<{ data: null; error: { message: string } }>()
    mockRpc.mockReturnValue({ single: () => d.promise })

    let call!: Promise<SetCellResult>
    act(() => {
      call = result.current.setCell(0, 0, 'B', false)
    })
    // A teammate's newer CDC event arrives while the RPC is still in flight.
    fireCdc({ owner_id: null, fill: 'C', version: 4 })
    expect(result.current.cells.get(cellKey(0, 0))?.fill).toBe('C')

    await act(async () => {
      d.resolve({ data: null, error: { message: 'boom' } })
      await call
    })
    // Rollback must NOT clobber the newer state: version moved past our
    // snapshot, so the teammate's letter wins.
    expect(result.current.cells.get(cellKey(0, 0))?.fill).toBe('C')
    expect(result.current.cells.get(cellKey(0, 0))?.version).toBe(4)
  })
})

describe('useCells — compete privacy drop (isMine)', () => {
  it('drops a CDC row that belongs to another owner', async () => {
    loadData = [row({ owner_id: ME, fill: 'A', version: 1 })]
    const { result } = renderHook(() => useCells(GAME_ID, ME))
    await fireSubscribed(() => result.current.loading)

    // An opponent's cell arrives on the wire (RLS doesn't withhold the CDC
    // payload) — the hook drops it before touching state.
    fireCdc({ owner_id: OTHER, row: 1, col: 1, fill: 'Q', version: 5 })
    expect(result.current.cells.has(cellKey(1, 1))).toBe(false)

    // Our own cell still applies.
    fireCdc({ owner_id: ME, fill: 'B', version: 2 })
    expect(result.current.cells.get(cellKey(0, 0))?.fill).toBe('B')
  })
})

describe('useCells — setMark (cryptic edge marks)', () => {
  it('applies a mark optimistically and adopts the RPC version', async () => {
    loadData = [row({ owner_id: null, version: 1 })]
    const { result } = renderHook(() => useCells(GAME_ID, null))
    await fireSubscribed(() => result.current.loading)

    const d = deferred<{ data: { version: number } | null; error: null }>()
    mockRpc.mockReturnValue({ single: () => d.promise })

    let call!: Promise<SetMarkResult>
    act(() => {
      call = result.current.setMark(0, 0, 'right', 'break')
    })
    // Optimistic: the mark shows before the RPC resolves; the other edge is
    // untouched.
    expect(result.current.cells.get(cellKey(0, 0))?.markRight).toBe('break')
    expect(result.current.cells.get(cellKey(0, 0))?.markBottom).toBeNull()

    await act(async () => {
      d.resolve({ data: { version: 6 }, error: null })
      await call
    })
    expect(result.current.cells.get(cellKey(0, 0))?.markRight).toBe('break')
    expect(result.current.cells.get(cellKey(0, 0))?.version).toBe(6)
  })

  it('rolls the mark back when the RPC errors', async () => {
    loadData = [row({ owner_id: null, mark_right: 'hyphen', version: 3 })]
    const { result } = renderHook(() => useCells(GAME_ID, null))
    await fireSubscribed(() => result.current.loading)

    mockRpc.mockReturnValue({
      single: () => Promise.resolve({ data: null, error: { message: 'nope' } }),
    })

    let out!: SetMarkResult
    await act(async () => {
      out = await result.current.setMark(0, 0, 'right', null)
    })
    expect(out).toEqual({ error: 'nope' })
    // Reverted to the pre-write mark, not left cleared.
    expect(result.current.cells.get(cellKey(0, 0))?.markRight).toBe('hyphen')
    expect(result.current.cells.get(cellKey(0, 0))?.version).toBe(3)
  })
})
