// cs-audited-club-page

/**
 * WHAT A GAMES ANSWER BECOMES, AND WHAT A FAILED ONE DOES INSTEAD.
 *
 * Two jobs. The first is the build: rows from `common.games` become entries
 * carrying their manifest, with the current one picked out by
 * `is_current_view` and a gametype this bundle does not have dropped on the
 * floor — the same forward-compat posture the start list takes.
 *
 * The second is the failure, and it is the reason this hook shows its own.
 * Nothing retries the read: it re-runs only when another `common.games` row
 * changes, and the commonest failure is the refetch after your own delete,
 * where that DELETE was the event. So a failure keeps the list it already has
 * AND says so, into the slot the caller hands it.
 *
 * Realtime is stubbed to a channel that never fires. The subscription's own
 * contract — the deaf-window closer, the SUBSCRIBED refetch, the teardown —
 * belongs to the e2es; what is here is what an ANSWER becomes.
 */

import { renderHook, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { Envelope } from '../supabase/envelope'
import type { FeedbackSlot } from '../feedback/useFeedbackSlot'

const { mockReadRows, realtime, WORDLE, SYRUP } = vi.hoisted(() => {
  const manifest = (gametype: string, name: string) => ({
    gametype,
    name,
    mode: 'coop' as const,
    labelFor: (row: { play_state: string }) => `label:${row.play_state}`,
  })
  return {
    mockReadRows: vi.fn(),
    // The `postgres_changes` handler the hook registers, so a test can fire the
    // event that actually drives a refetch.
    realtime: { onChange: null as (() => void) | null },
    WORDLE: manifest('wordle_coop', 'WordNerd'),
    SYRUP: manifest('syrup_coop', 'SyrupSwap'),
  }
})

vi.mock('../supabase/db', () => {
  const builder = new Proxy({}, { get: () => () => builder })
  return { db: { from: () => builder } }
})

vi.mock('../supabase/supabase', () => {
  // `.channel().on(...).subscribe(...)` — every link returns the channel. The
  // `on` keeps the handler so a test can fire a games change; `subscribe`'s
  // callback is never invoked, so the SUBSCRIBED reload does not fire here.
  const channel: Record<string, unknown> = {}
  channel.on = (_event: string, _config: unknown, cb: () => void) => {
    realtime.onChange = cb
    return channel
  }
  channel.subscribe = () => channel
  return { supabase: { channel: () => channel, removeChannel: vi.fn() } }
})

vi.mock('../supabase/dbResult', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../supabase/dbResult')>()),
  readRows: mockReadRows,
}))

vi.mock('../realtime/postgresAttached', () => ({ onPostgresAttached: () => {} }))
vi.mock('@/gametypes', () => ({ gametypes: [WORDLE, SYRUP] }))

import { useClubGames } from './useClubGames'

type GameRow = {
  id: string
  gametype: string
  title: string
  play_state: string
  is_terminal: boolean
  status: unknown
  setup: unknown
  last_active_at: string
  is_current_view: boolean
}

function game(over: Partial<GameRow> & { id: string; gametype: string }): GameRow {
  return {
    title: `Game ${over.id}`,
    play_state: 'playing',
    is_terminal: false,
    status: {},
    setup: {},
    last_active_at: '2026-09-01T00:00:00Z',
    is_current_view: false,
    ...over,
  }
}

function ok<T>(data: T): Envelope<T> {
  return {
    type: 'ok', data, severity: null, field: null, meta: null,
    dbcode: null, detail: null, message: null, outcome: null,
  }
}

function theReadFailed(): Envelope<never> {
  return {
    type: 'not-ok', data: null, outcome: null, severity: 'fault',
    message: 'You appear to be offline.', field: null, meta: null,
    dbcode: 'PN301', detail: null,
  }
}

/** A slot that records what was shown into it. */
function slot() {
  const show = vi.fn()
  return { slot: { show } as unknown as FeedbackSlot, show }
}

/** Mount the hook and wait for the first read to have settled. */
async function load(rows: Envelope<unknown>) {
  mockReadRows.mockResolvedValue(rows)
  const showed = slot()
  const view = renderHook(() => useClubGames('trio', showed.slot))
  await waitFor(() => expect(mockReadRows).toHaveBeenCalled())
  return { ...view, ...showed }
}

beforeEach(() => {
  mockReadRows.mockReset()
  realtime.onChange = null
})

describe('useClubGames — what an answer becomes', () => {
  it('builds an entry per row, in the order they came', async () => {
    const { result } = await load(
      ok([
        game({ id: 'g1', gametype: 'wordle_coop', title: 'Alpha' }),
        game({ id: 'g2', gametype: 'syrup_coop', title: 'Beta' }),
      ]),
    )
    await waitFor(() => expect(result.current.games).toHaveLength(2))
    expect(result.current.games.map((g) => g.title)).toEqual(['Alpha', 'Beta'])
  })

  it('resolves each row to its manifest and its status label', async () => {
    const { result } = await load(
      ok([game({ id: 'g1', gametype: 'syrup_coop', play_state: 'won' })]),
    )
    await waitFor(() => expect(result.current.games).toHaveLength(1))
    expect(result.current.games[0]!.manifest).toBe(SYRUP)
    // The label is the manifest's, computed once here rather than at render.
    expect(result.current.games[0]!.statusLabel).toBe('label:won')
  })

  it('picks the current game out by is_current_view', async () => {
    const { result } = await load(
      ok([
        game({ id: 'g1', gametype: 'wordle_coop' }),
        game({ id: 'g2', gametype: 'syrup_coop', is_current_view: true }),
      ]),
    )
    await waitFor(() => expect(result.current.currentGameId).toBe('g2'))
  })

  it('reports no current game when no row claims to be one', async () => {
    const { result } = await load(ok([game({ id: 'g1', gametype: 'wordle_coop' })]))
    await waitFor(() => expect(result.current.games).toHaveLength(1))
    expect(result.current.currentGameId).toBeNull()
  })

  it('drops a gametype this bundle does not have', async () => {
    const { result } = await load(
      ok([
        game({ id: 'g1', gametype: 'wordle_coop', title: 'Alpha' }),
        game({ id: 'g2', gametype: 'gametype_from_the_future', title: 'Beta' }),
      ]),
    )
    await waitFor(() => expect(result.current.games).toHaveLength(1))
    expect(result.current.games[0]!.title).toBe('Alpha')
  })

  it('still reads the current pointer off a row it dropped', async () => {
    // The pointer is read before the manifest lookup on purpose: a club whose
    // current game this bundle cannot draw still has one, and the heal must
    // not mistake that for "nobody is in a game".
    const { result } = await load(
      ok([game({ id: 'g9', gametype: 'gametype_from_the_future', is_current_view: true })]),
    )
    await waitFor(() => expect(result.current.currentGameId).toBe('g9'))
    expect(result.current.games).toHaveLength(0)
  })
})

describe('useClubGames — a failed read', () => {
  it('says so, in the slot it was handed', async () => {
    const { show } = await load(theReadFailed())
    await waitFor(() => expect(show).toHaveBeenCalled())
    // The server's own words: the page writes none of this.
    expect(show.mock.calls[0]![0]).toMatchObject({ text: 'You appear to be offline.' })
  })

  it('raises the flag its caller draws an empty state from', async () => {
    const { result } = await load(theReadFailed())
    await waitFor(() => expect(result.current.failed).toBe(true))
  })

  it('keeps the list it already had rather than emptying it', async () => {
    mockReadRows.mockResolvedValue(
      ok([game({ id: 'g1', gametype: 'wordle_coop', title: 'Alpha' })]),
    )
    const showed = slot()
    const { result } = renderHook(() => useClubGames('trio', showed.slot))
    await waitFor(() => expect(result.current.games).toHaveLength(1))

    // A games change arrives and its refetch fails. Writing `[]` here would
    // replace a stale list with "this club has no games", which is a worse
    // answer than a stale one.
    mockReadRows.mockResolvedValue(theReadFailed())
    realtime.onChange?.()
    await waitFor(() => expect(showed.show).toHaveBeenCalled())
    expect(result.current.games.map((g) => g.title)).toEqual(['Alpha'])
  })
})
