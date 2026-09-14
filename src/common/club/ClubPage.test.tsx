// cs-audited-club-page

/**
 * WHAT THE PAGE DRAWS FOR EACH ANSWER IT CAN GET.
 *
 * Two reads with two different jobs, which is the whole shape of this file. The
 * club load is one RPC and the page cannot exist without it, so its three
 * answers are three whole pages: the club, an error page, or the scream's. The
 * games read runs against a page that is already up and whose other half is
 * fine, so its failure keeps the list and says so twice — a message that
 * outlives the modal, and an empty state that stops claiming the club has no
 * games.
 *
 * The rest is what the page decides for itself once it has both: which rows a
 * filter leaves, that each filter reaches only its own list, and what a delete
 * answer puts on screen.
 *
 * Mocking strategy
 * ----------------
 * `runRpc` and `readRows` are mocked rather than the query builder, so an
 * answer is chosen directly AND the fault queue stays empty unless this page
 * put something in it. With the real wrappers a failed read would report its
 * own fault and there would be no telling whose it was.
 *
 * The cost of that is worth naming: a mocked wrapper does not present faults
 * either, so an empty fault queue is NOT evidence that `presentFaults: false`
 * was passed. That half is asserted at the call instead.
 *
 * `@/gametypes` is a registry of three, not the real sixteen, so a filter
 * assertion can name the rows it expects instead of counting them.
 *
 * Realtime is stubbed to nothing. The presence hooks, the games subscription,
 * the abandoned-pointer heal and the delete broadcast are all event-driven and
 * belong to the e2es; what is left here is what the page does with an answer.
 */

import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { Session } from '@supabase/supabase-js'
import type { Envelope } from '../supabase/envelope'
import type { GameManifest } from '../manifest/gameManifest'

// The registry lives in `vi.hoisted` because `vi.mock('@/gametypes')`'s factory
// is lifted above the file's consts and would not see them otherwise.
const { mockRunRpc, mockReadRows, mockToast, WORDLE, DUEL, SYRUP } = vi.hoisted(() => {
  /** A manifest with only the fields this page reads. */
  const manifest = (gametype: string, mode: 'coop' | 'compete', name: string) => ({
    gametype,
    schema: gametype,
    baseGametype: gametype,
    mode,
    name,
    shortDescription: `${name} description`,
    logoUrl: '',
    numberOfPlayers: [1, 4] as [number, number],
    labelFor: (row: { play_state: string }) => `label:${row.play_state}`,
  })
  return {
    mockRunRpc: vi.fn(),
    mockReadRows: vi.fn(),
    mockToast: vi.fn(),
    WORDLE: manifest('wordle_coop', 'coop', 'WordNerd'),
    DUEL: manifest('wordle_compete', 'compete', 'WordNerd'),
    SYRUP: manifest('syrup_coop', 'coop', 'SyrupSwap'),
  }
})

vi.mock('../supabase/db', () => {
  const builder = new Proxy({}, { get: () => () => builder })
  return { db: { from: () => builder, rpc: (name: string) => name } }
})

vi.mock('../supabase/supabase', () => {
  // `.channel().on(...).subscribe(...)` — every link returns the channel.
  const channel: Record<string, unknown> = {}
  channel.on = () => channel
  channel.subscribe = () => channel
  return { supabase: { channel: () => channel, removeChannel: vi.fn() } }
})

vi.mock('../supabase/dbResult', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../supabase/dbResult')>()),
  runRpc: mockRunRpc,
  readRows: mockReadRows,
}))

vi.mock('../toasts/toastStore', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../toasts/toastStore')>()),
  showToast: mockToast,
}))

vi.mock('../realtime/useClubPresence', () => ({ useClubPresence: () => [] }))
vi.mock('../realtime/useClubSetupPresence', () => ({ useClubSetupPresence: () => {} }))
vi.mock('../realtime/postgresAttached', () => ({ onPostgresAttached: () => {} }))
vi.mock('../chat/Chat', () => ({ Chat: () => null }))

// Mounted only to assert THAT it opened, so it renders its gametype and
// nothing else — the form itself is setup-form's to test.
vi.mock('../setup-form/SetupGameModal', () => ({
  SetupGameModal: ({ manifest }: { manifest: GameManifest }) => (
    <div data-testid="setup-dialog">{manifest.gametype}</div>
  ),
}))

vi.mock('@/gametypes', () => ({ gametypes: [WORDLE, DUEL, SYRUP] }))

import { ClubPage } from './ClubPage'
import { clearFaultsForTest, peekFaultsForTest } from '../faults/faultStore'

// jsdom implements neither, and SelectionList uses both to keep its cursor row
// inside the frame.
Element.prototype.scrollIntoView = vi.fn()

const session = { user: { id: 'ada' } } as unknown as Session

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

function notOk(message: string, dbcode: string): Envelope<never> {
  return {
    type: 'not-ok', data: null, outcome: null, severity: 'fault',
    message, field: null, meta: null, dbcode, detail: null,
  }
}

/** The club payload `get_club_page` answers with. */
function clubLoaded(over: { gametypes?: string[]; isSolo?: boolean } = {}) {
  return ok({
    result: 'loaded',
    club: { handle: 'trio', name: 'Trio', is_solo: over.isSolo ?? false },
    members: [
      { user_id: 'ada', username: 'ada', color: 'red' },
      { user_id: 'bea', username: 'bea', color: 'blue' },
    ],
    gametypes: (over.gametypes ?? ['wordle_coop', 'wordle_compete', 'syrup_coop'])
      .map((gametype) => ({ gametype, default_setup: null })),
  })
}

/** Render, and wait for both reads to have settled into the page. */
async function draw() {
  const view = render(<ClubPage handle="trio" session={session} />)
  await waitFor(() => expect(screen.queryByText('Loading…')).not.toBeInTheDocument())
  return view
}

function startList() {
  return within(screen.getByRole('group', { name: 'Start a new game' }))
}

function gamesList() {
  return within(screen.getByRole('group', { name: 'Your games' }))
}

/**
 * A heading's own controls row. Scoped because BOTH instances of each filter
 * are in the tree — the desktop one beside its heading, the mobile one under
 * the tab bar — and jsdom applies no media queries, so the hidden one answers
 * a bare query too. See club/doc.md for why that duplication is the shape.
 */
function headingRow(heading: string) {
  const h = screen.getByRole('heading', { name: heading })
  if (!h.parentElement) throw new Error(`no controls row around "${heading}"`)
  return within(h.parentElement)
}

/** A list's no-rows line — SelectionList draws it whether or not it's empty. */
function emptyLine(list: ReturnType<typeof within>) {
  return list.queryByText((_content: string, el: Element | null) =>
    el?.className === 'emptyState')
}

beforeEach(() => {
  mockRunRpc.mockReset()
  mockReadRows.mockReset()
  mockToast.mockReset()
  clearFaultsForTest()
  window.history.replaceState(null, '', '/c/trio')
  mockRunRpc.mockResolvedValue(clubLoaded())
  mockReadRows.mockResolvedValue(ok([]))
})

describe('ClubPage — the club load is the page', () => {
  it('draws the club once the RPC answers', async () => {
    await draw()
    expect(screen.getByText('Club: Trio')).toBeInTheDocument()
    expect(startList().getByText('SyrupSwap')).toBeInTheDocument()
  })

  it('draws the server-worded error page for a not-ok, and raises no modal', async () => {
    mockRunRpc.mockResolvedValue(notOk('No club with that name', 'PN494'))
    await draw()

    // The sentence is the server's, verbatim — the page words none of these.
    expect(screen.getByText('No club with that name')).toBeInTheDocument()
    expect(screen.queryByText('Club: Trio')).not.toBeInTheDocument()
    // Two halves of one promise, and they need separate assertions because
    // `runRpc` is mocked here: the wrapper is what would have raised the modal,
    // so the empty queue only proves the PAGE raised nothing itself. That the
    // wrapper was told not to is checked at the call.
    expect(mockRunRpc).toHaveBeenCalledWith(expect.anything(), { presentFaults: false })
    expect(peekFaultsForTest()).toEqual([])
  })

  it('tells apart the two answers RLS could not', async () => {
    mockRunRpc.mockResolvedValue(notOk('You are not a member of this club', 'PN495'))
    await draw()
    expect(screen.getByText('You are not a member of this club')).toBeInTheDocument()
  })

  it('screams on an answer that is neither, and still leaves a page behind it', async () => {
    mockRunRpc.mockResolvedValue({ type: 'maybe' } as unknown as Envelope<never>)
    await draw()
    expect(peekFaultsForTest()).toHaveLength(1)
    expect(screen.queryByText('Club: Trio')).not.toBeInTheDocument()
  })
})

describe('ClubPage — the games list', () => {
  it('lists what came back, and finds the current game by is_current_view', async () => {
    mockReadRows.mockResolvedValue(
      ok([
        game({ id: 'g1', gametype: 'wordle_coop', title: 'Alpha', is_current_view: true }),
        game({ id: 'g2', gametype: 'syrup_coop', title: 'Beta' }),
      ]),
    )
    await draw()

    // `draw` waits for the club load; the games read settles a tick after it,
    // so the first assertion retries and the rest can be immediate.
    expect(await gamesList().findByText('Alpha')).toBeInTheDocument()
    expect(gamesList().getByText('Beta')).toBeInTheDocument()
    // The current game gets the card as well as its row.
    expect(screen.getByText('Join the current game')).toBeInTheDocument()
  })

  it('skips a gametype this frontend does not know', async () => {
    mockReadRows.mockResolvedValue(
      ok([
        game({ id: 'g1', gametype: 'wordle_coop', title: 'Alpha' }),
        game({ id: 'g2', gametype: 'gametype_from_the_future', title: 'Beta' }),
      ]),
    )
    await draw()
    expect(await gamesList().findByText('Alpha')).toBeInTheDocument()
    expect(gamesList().queryByText('Beta')).not.toBeInTheDocument()
  })

  it('a failed read keeps the page and says so where the games would be', async () => {
    mockReadRows.mockResolvedValue(notOk('You appear to be offline.', 'PN301'))
    await draw()

    // The page stands: this half loaded.
    expect(screen.getByText('Club: Trio')).toBeInTheDocument()
    // "No games yet." would be a lie — the read is what came back empty.
    await waitFor(() =>
      expect(emptyLine(gamesList())).toHaveTextContent('Could not load this club’s games.'))
    // And a message that outlives dismissing the modal readRows raised.
    expect(screen.getByText('You appear to be offline.')).toBeInTheDocument()
  })
})

describe('ClubPage — each filter reaches one list', () => {
  beforeEach(() => {
    mockReadRows.mockResolvedValue(
      ok([
        game({ id: 'g1', gametype: 'wordle_coop', title: 'Alpha' }),
        game({ id: 'g2', gametype: 'syrup_coop', title: 'Beta' }),
      ]),
    )
  })

  it('the mode filter narrows the start list and leaves the games list alone', async () => {
    await draw()
    await gamesList().findByText('Alpha')
    expect(startList().getAllByText('WordNerd')).toHaveLength(2)

    await userEvent.click(
      headingRow('Start a new game').getByRole('button', { name: 'Compete' }),
    )

    // One WordNerd left — the compete sibling — and SyrupSwap is coop, so gone.
    expect(startList().getAllByText('WordNerd')).toHaveLength(1)
    expect(startList().queryByText('SyrupSwap')).not.toBeInTheDocument()
    expect(gamesList().getByText('Alpha')).toBeInTheDocument()
    expect(gamesList().getByText('Beta')).toBeInTheDocument()
  })

  it('the start list can be emptied by the mode filter, and says which mode', async () => {
    mockRunRpc.mockResolvedValue(clubLoaded({ gametypes: ['wordle_coop', 'syrup_coop'] }))
    await draw()

    await userEvent.click(
      headingRow('Start a new game').getByRole('button', { name: 'Compete' }),
    )
    expect(emptyLine(startList())).toHaveTextContent('No Compete games in this club.')
  })

  it('a solo club gets no mode filter, and is pinned to all', async () => {
    mockRunRpc.mockResolvedValue(clubLoaded({ isSolo: true }))
    await draw()

    expect(
      headingRow('Start a new game').queryByRole('button', { name: 'Compete' }),
    ).not.toBeInTheDocument()
    expect(startList().getAllByText('WordNerd')).toHaveLength(2)
    expect(startList().getByText('SyrupSwap')).toBeInTheDocument()
  })
})

describe('ClubPage — ?new= opens the setup dialog', () => {
  it('opens it for the requested gametype, once the club has loaded', async () => {
    window.history.replaceState(null, '', '/c/trio?new=syrup_coop')
    await draw()
    expect(await screen.findByTestId('setup-dialog')).toHaveTextContent('syrup_coop')
  })

  it('ignores a gametype this frontend does not know', async () => {
    window.history.replaceState(null, '', '/c/trio?new=gametype_from_the_future')
    await draw()
    expect(screen.queryByTestId('setup-dialog')).not.toBeInTheDocument()
  })
})

describe('ClubPage — what a delete answer puts on screen', () => {
  /**
   * Press the trash can on the one listed game, then confirm. The button is a
   * two-step: the first press turns "Delete game" into "Confirm delete?" and
   * only the second calls the RPC, so a misclick can be ignored rather than
   * cancelled.
   */
  async function deleteTheGame() {
    await userEvent.click(await gamesList().findByRole('button', { name: 'Delete game' }))
    await userEvent.click(gamesList().getByRole('button', { name: 'Confirm delete?' }))
  }

  beforeEach(() => {
    mockReadRows.mockResolvedValue(
      ok([game({ id: 'g1', gametype: 'wordle_coop', title: 'Alpha' })]),
    )
  })

  it('toasts the title on a successful delete', async () => {
    await draw()
    mockRunRpc.mockResolvedValue(ok({ result: 'deleted' }))
    await deleteTheGame()

    // The title is looked up BEFORE the refetch sweeps the row out of the list.
    expect(mockToast).toHaveBeenCalledWith(
      expect.objectContaining({ message: 'Alpha deleted', tone: 'success' }),
    )
  })

  it('toasts a not-ok and lets the button back out', async () => {
    await draw()
    mockRunRpc.mockResolvedValue(notOk('That game no longer exists', 'PN013'))
    await deleteTheGame()

    // EVERY severity gets the toast, a fault included: the modal readRows or
    // runRpc raised is dismissable, and this is what survives dismissing it.
    expect(mockToast).toHaveBeenCalledWith(
      expect.objectContaining({ message: 'That game no longer exists', tone: 'error' }),
    )
    // The throw is what returns the button to idle rather than stranding it on
    // "Deleting…" with the game still listed.
    expect(await gamesList().findByRole('button', { name: 'Delete game' })).toBeInTheDocument()
  })

  it('screams at an answer it has no branch for', async () => {
    await draw()
    mockRunRpc.mockResolvedValue(ok({ result: 'something-new' }))
    await deleteTheGame()

    await waitFor(() => expect(peekFaultsForTest()).toHaveLength(1))
    expect(mockToast).not.toHaveBeenCalled()
  })
})
