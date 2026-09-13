// cs-audited-homepage

/**
 * WHAT THE PAGE SAYS WHILE IT DOESN'T KNOW YET, and what it says once it does.
 *
 * The clubs list is a read, so there are three moments and the empty list looks
 * the same in all of them: before the answer, after a failed answer, and after
 * an answer of no rows. Only the last is a normal moment, and each owes a
 * different sentence — which is the whole reason `load` is a three-state field
 * rather than a boolean. A regression here does not crash anything; it tells a
 * player they belong to no clubs while the request is still in flight.
 *
 * The other half is the zero-rows FAULT. Claiming a username materializes a
 * solo club atomically, so a signed-in user always has at least one row, and an
 * empty answer means the account is broken. The server has no opinion about
 * that — it answered a well-formed query correctly — so the page raises the
 * fault itself, on every load. Both halves of that are pinned: that the page
 * raises it when the answer is empty, and that it raises NOTHING when the read
 * merely failed, because `readRows` has already reported that one.
 *
 * Mocking strategy
 * ----------------
 * `useRealtimeRefetch` is replaced by a stub that runs the page's `load` once
 * on mount and hands the config back, so a test can run the load again and see
 * what the page subscribed to. The hook's own contract — the channel, the
 * SUBSCRIBED refetch, the mounted guard — belongs to
 * `realtime/useRealtimeRefetch.test.ts` and is not re-tested here.
 *
 * `readRows` is mocked rather than the query, so the answer is chosen directly
 * AND the fault queue stays empty unless this page put something in it. With
 * the real `readRows`, a failed read would report its own fault and there would
 * be no way to tell whose it was.
 */

import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { Session } from '@supabase/supabase-js'
import type { Envelope } from '../supabase/envelope'

type Club = { handle: string; name: string; is_solo: boolean }

/** The shape `HomePage` hands `useRealtimeRefetch`, as the stub sees it. */
type RefetchConfig = {
  tables: { schema: string; table: string; filter: string }
  channelPrefix: string
  id: string
  load: (handle: { mounted: () => boolean }) => Promise<void>
}

const { queryParts, mockRpc, mockReadRows, profile, refetch } = vi.hoisted(() => ({
  // Every builder call the page made, in order — the display-order decision is
  // in the query, not in the component, so this is where it can be checked.
  queryParts: [] as string[],
  mockRpc: vi.fn(),
  mockReadRows: vi.fn(),
  profile: { current: null as { username: string; color: string } | null },
  refetch: { config: null as RefetchConfig | null },
}))

vi.mock('../supabase/supabase', () => ({
  supabase: { auth: { signOut: vi.fn() } },
}))

vi.mock('../supabase/db', () => {
  const builder = {
    select: (columns: string) => {
      queryParts.push(`select ${columns}`)
      return builder
    },
    order: (column: string, opts?: { ascending?: boolean }) => {
      queryParts.push(`order ${column} ${opts?.ascending === false ? 'desc' : 'asc'}`)
      return builder
    },
  }
  return {
    db: {
      from: (table: string) => {
        queryParts.push(`from ${table}`)
        return builder
      },
      rpc: mockRpc,
    },
  }
})

// Only `readRows` is replaced: `CreateClubModal` reaches for `runRpc` from the
// same module, and it is mounted for real below.
vi.mock('../supabase/dbResult', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../supabase/dbResult')>()),
  readRows: mockReadRows,
}))

vi.mock('../session/useProfile', () => ({ useProfile: () => profile.current }))

vi.mock('../realtime/useRealtimeRefetch', async () => {
  const { useEffect } = await vi.importActual<typeof import('react')>('react')
  return {
    useRealtimeRefetch: (config: RefetchConfig) => {
      refetch.config = config
      // The real hook loads once on mount and again on every event; the stub
      // does the first half, and a test asking for the second calls `load`.
      // `config` is a fresh object every render, so it stays out of the deps.
      useEffect(() => {
        void config.load({ mounted: () => true })
        // eslint-disable-next-line react-hooks/exhaustive-deps
      }, [])
    },
  }
})

import { HomePage } from './HomePage'
import { clearFaultsForTest, peekFaultsForTest } from '../faults/faultStore'

// jsdom doesn't implement scrollIntoView, and SelectionList keeps its cursor
// row inside the frame with it.
Element.prototype.scrollIntoView = vi.fn()

const session = { user: { id: 'u-1' } } as unknown as Session

const SOLO: Club = { handle: '=joel', name: 'joel', is_solo: true }
const SHARED: Club = { handle: 'book-club', name: 'Book Club', is_solo: false }

function rowsCameBack(rows: Club[]): Envelope<Club[]> {
  return {
    type: 'ok',
    data: rows,
    severity: null,
    field: null,
    meta: null,
    dbcode: null,
    detail: null,
    message: null,
    outcome: null,
  }
}

function theReadFailed(): Envelope<Club[]> {
  return {
    type: 'not-ok',
    data: null,
    outcome: null,
    severity: 'service-error',
    message: 'You appear to be offline.',
    field: null,
    meta: null,
    dbcode: 'PN301',
    detail: null,
  }
}

/** Render and wait for the mount load to have settled into the list. */
async function draw() {
  const view = render(<HomePage session={session} />)
  await waitFor(() => expect(mockReadRows).toHaveBeenCalled())
  return view
}

/** The frame's no-rows line — SelectionList draws it whether or not it's empty. */
function emptyLine() {
  return within(screen.getByRole('group', { name: 'Your clubs' })).queryByText(
    (_, el) => el?.className === 'emptyState',
  )
}

beforeEach(() => {
  queryParts.length = 0
  mockRpc.mockReset()
  mockReadRows.mockReset()
  refetch.config = null
  profile.current = { username: 'joel', color: 'red' }
  clearFaultsForTest()
  window.history.replaceState(null, '', '/')
})

describe('HomePage — an empty list means three different things', () => {
  it('says nothing at all while the read is in flight', async () => {
    // Never resolves: the page stays in the moment before an answer.
    mockReadRows.mockReturnValue(new Promise(() => {}))
    await draw()

    // A non-breaking space, so the frame holds its height without making a
    // claim. Both real sentences would be lies right now.
    // `toHaveTextContent` normalizes whitespace away, so the nbsp is compared
    // as the raw character it is.
    expect(emptyLine()?.textContent).toBe('\u00a0')
    expect(screen.queryByText(/couldn't be loaded/)).not.toBeInTheDocument()
    expect(screen.queryByText(/No clubs found/)).not.toBeInTheDocument()
  })

  it('says the load failed — and raises no fault of its own, because readRows did', async () => {
    mockReadRows.mockResolvedValue(theReadFailed())
    await draw()

    await screen.findByText("Your clubs couldn't be loaded.")
    // The page's whole job on this path is `setLoad('failed')`. If it ever
    // starts classifying or wording the failure, this is what notices.
    expect(peekFaultsForTest()).toHaveLength(0)
  })

  it('says no clubs found when the answer really is empty', async () => {
    mockReadRows.mockResolvedValue(rowsCameBack([]))
    await draw()

    await screen.findByText('No clubs found for your account.')
  })
})

describe('HomePage — zero rows is the page raising a fault, every time', () => {
  it('raises the broken-account fault on an empty answer', async () => {
    mockReadRows.mockResolvedValue(rowsCameBack([]))
    await draw()

    await waitFor(() => expect(peekFaultsForTest()).toHaveLength(1))
    const fault = peekFaultsForTest()[0]
    expect(fault.text).toMatch(/you should always have at least your own solo club/)
    // The page writes its own transport facts, because `readRows` answered ok
    // and has nothing to say about a site invariant.
    expect(fault.diagnostics).toMatch(/rows=0/)
  })

  it('raises it again on the next load, not once per mount', async () => {
    mockReadRows.mockResolvedValue(rowsCameBack([]))
    await draw()
    await waitFor(() => expect(peekFaultsForTest()).toHaveLength(1))

    // What a realtime membership event does: the same load, again.
    await refetch.config!.load({ mounted: () => true })

    await waitFor(() => expect(peekFaultsForTest()).toHaveLength(2))
  })

  it('raises nothing when clubs come back', async () => {
    mockReadRows.mockResolvedValue(rowsCameBack([SOLO, SHARED]))
    await draw()

    await screen.findByText('Book Club')
    expect(peekFaultsForTest()).toHaveLength(0)
  })
})

describe('HomePage — the greeting', () => {
  it('leads with the identity disc and the username once the profile lands', async () => {
    mockReadRows.mockResolvedValue(rowsCameBack([SOLO]))
    await draw()

    const greeting = screen.getByRole('heading', { level: 1 })
    expect(greeting).toHaveTextContent('joel — welcome!')
  })

  it('greets without a name while there is no profile', async () => {
    profile.current = null
    mockReadRows.mockResolvedValue(rowsCameBack([SOLO]))
    await draw()

    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('Welcome!')
  })
})

describe('HomePage — the clubs list', () => {
  it('asks the database for the display order: solo first, then newest', async () => {
    mockReadRows.mockResolvedValue(rowsCameBack([SOLO, SHARED]))
    await draw()

    // Postgres sorts false before true, so `is_solo` DESC is what puts solo on
    // top. The page re-derives neither the order nor the grouping.
    expect(queryParts).toEqual([
      'from clubs',
      'select handle, name, is_solo',
      'order is_solo desc',
      'order created_at desc',
    ])
  })

  it('marks the solo club and only the solo club', async () => {
    mockReadRows.mockResolvedValue(rowsCameBack([SOLO, SHARED]))
    await draw()

    await screen.findByText('Book Club')
    const badges = screen.getAllByText('Solo')
    expect(badges).toHaveLength(1)
    expect(badges[0].parentElement).toHaveTextContent('joel')
  })

  it('goes into the club when a row is chosen', async () => {
    mockReadRows.mockResolvedValue(rowsCameBack([SOLO, SHARED]))
    await draw()

    await userEvent.click(await screen.findByText('Book Club'))

    expect(window.location.pathname).toBe('/c/book-club')
  })
})

describe('HomePage — creating a club', () => {
  it('opens the create-club modal over the list', async () => {
    mockReadRows.mockResolvedValue(rowsCameBack([SOLO]))
    await draw()

    await userEvent.click(screen.getByRole('button', { name: '+ New club' }))

    // A modal and not a page, so the list it adds to is still behind it.
    // The panel's title is a span, not a heading, so the text is the handle.
    expect(await screen.findByText('Create a club')).toBeInTheDocument()
    expect(screen.getByRole('group', { name: 'Your clubs' })).toBeInTheDocument()
  })

  it('goes into the club it just made', async () => {
    mockReadRows.mockResolvedValue(rowsCameBack([SOLO]))
    // `create_club`'s own answer, as the raw postgrest shape `runRpc` unwraps.
    mockRpc.mockResolvedValue({
      data: {
        type: 'ok',
        data: { result: 'created', handle: 'new-club' },
        severity: null,
        field: null,
        meta: null,
        dbcode: null,
        detail: null,
        message: null,
        outcome: null,
      },
      error: null,
    })
    await draw()

    await userEvent.click(screen.getByRole('button', { name: '+ New club' }))
    await userEvent.type(await screen.findByRole('textbox', { name: /Club name/ }), 'New Club')
    await userEvent.click(screen.getByRole('button', { name: 'Create club' }))

    // Which is what you made it for — the page's `onCreated`, not the modal's.
    await waitFor(() => expect(window.location.pathname).toBe('/c/new-club'))
  })
})
