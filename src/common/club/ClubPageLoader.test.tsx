// cs-blessed-club-page

/**
 * EVERY ANSWER IS A WHOLE PAGE.
 *
 * `get_club_page` can say the club, say no, or say something this frontend
 * cannot read, and each of those is a whole page rather than a state inside
 * one. That is the split's whole point: past here, `<ClubPage>` holds a club
 * that is definitely there.
 *
 * `?new=<gametype>` names the game whose setup dialog to open, and it must pass
 * the same two tests a start row does — the registry HAS the game, and this
 * club PLAYS it. Both are checked after the load, because the second needs the
 * club's enrolled list, and each failing half is its own page with its own
 * sentence.
 *
 * The not-ok arm carries two things worth pinning separately. The sentence is
 * the SERVER'S — including "no club with that name" and "you are not a member",
 * which the RPC can tell apart and a direct read could not, since RLS hides a
 * club you are outside and both would arrive as zero rows. And no modal goes
 * up: `presentFaults: false` is a promise to show its own, and the page IS the
 * showing.
 *
 * `<ClubPage>` is mocked to a marker that prints what it was handed, so these
 * tests are about the load and nothing downstream of it.
 */

import { render, screen, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { Session } from '@supabase/supabase-js'
import type { Envelope } from '../supabase/envelope'
import type { ClubPageData } from './ClubPage'

const { mockRunRpc } = vi.hoisted(() => ({ mockRunRpc: vi.fn() }))

vi.mock('../supabase/db', () => ({ db: { rpc: (name: string) => name } }))

// The registry AND its lookup, from one list: `manifestFor` reads the registry,
// so a mock supplying only the list would let the two disagree.
// Two games in the registry and only ONE in the club's enrolled set (see
// `loaded()`), which is what lets a test tell the two refusals apart.
vi.mock('@/gametypes', () => ({
  gametypes: [
    { gametype: 'wordle_coop', name: 'WordNerd' },
    { gametype: 'syrup_coop', name: 'SyrupSwap' },
  ],
  manifestFor: (gametype: string) =>
    [
      { gametype: 'wordle_coop', name: 'WordNerd' },
      { gametype: 'syrup_coop', name: 'SyrupSwap' },
    ].find((g) => g.gametype === gametype),
}))

vi.mock('../supabase/dbResult', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../supabase/dbResult')>()),
  runRpc: mockRunRpc,
}))

// A marker, not the page: what reaches it is the only thing these tests care
// about, and mounting the real one would drag in every hook it owns.
vi.mock('./ClubPage', () => ({
  ClubPage: (props: { club: { name: string }; members: { username: string }[] }) => (
    <div data-testid="club-page">
      {props.club.name} · {props.members.map((m) => m.username).join(',')}
    </div>
  ),
}))

import { ClubPageLoader } from './ClubPageLoader'
import { clearFaultsForTest, peekFaultsForTest } from '../faults/faultStore'

const session = { user: { id: 'ada' } } as unknown as Session

function loaded(): Envelope<ClubPageData> {
  return {
    type: 'ok',
    data: {
      result: 'loaded',
      club: { handle: 'trio', name: 'Trio', is_solo: false },
      members: [
        { user_id: 'ada', username: 'ada', color: 'red' },
        { user_id: 'bea', username: 'bea', color: 'blue' },
      ],
      gametypes: [{ gametype: 'wordle_coop', default_setup: null }],
    },
    severity: null, field: null, meta: null, dbcode: null, detail: null,
    message: null, outcome: null,
  }
}

function refused(message: string, dbcode: string): Envelope<never> {
  return {
    type: 'not-ok', data: null, outcome: null, severity: 'fault',
    message, field: null, meta: null, dbcode, detail: null,
  }
}

function draw() {
  return render(<ClubPageLoader handle="trio" session={session} />)
}

beforeEach(() => {
  mockRunRpc.mockReset()
  clearFaultsForTest()
  window.history.replaceState(null, '', '/c/trio')
})

describe('ClubPageLoader — a ?new= this club cannot honor', () => {
  it('draws an error page for a gametype the registry does not have', async () => {
    window.history.replaceState(null, '', '/c/trio?new=gametype_from_the_future')
    mockRunRpc.mockResolvedValue(loaded())
    draw()
    expect(await screen.findByText(/no game type called/i)).toBeInTheDocument()
    expect(screen.getByText('gametype_from_the_future')).toBeInTheDocument()
    expect(screen.queryByTestId('club-page')).not.toBeInTheDocument()
  })

  it('draws a DIFFERENT error page for a real game this club does not play', async () => {
    // The hole this check closes: `?new=` opens the setup dialog without a
    // start row, and the start list is what otherwise enforces enrollment.
    // A real game the club never enrolled in is not a wrong link — it is a
    // game this club does not play, and says so.
    window.history.replaceState(null, '', '/c/trio?new=syrup_coop')
    mockRunRpc.mockResolvedValue(loaded())
    draw()
    expect(await screen.findByText(/doesn't play/i)).toHaveTextContent(
      "Trio doesn't play SyrupSwap",
    )
    expect(screen.queryByText(/no game type called/i)).toBeNull()
    expect(screen.queryByTestId('club-page')).not.toBeInTheDocument()
  })

  it('loads the club as usual when ?new= names a game it plays', async () => {
    window.history.replaceState(null, '', '/c/trio?new=wordle_coop')
    mockRunRpc.mockResolvedValue(loaded())
    draw()
    expect(await screen.findByTestId('club-page')).toHaveTextContent('Trio · ada,bea')
  })
})

describe('ClubPageLoader', () => {
  it('says only "Loading…" while the RPC is in flight', () => {
    // Never resolves: the loader stays in the moment before an answer.
    mockRunRpc.mockReturnValue(new Promise(() => {}))
    draw()
    expect(screen.getByText('Loading…')).toBeInTheDocument()
    expect(screen.queryByTestId('club-page')).not.toBeInTheDocument()
  })

  it('hands the payload to the page once the club answers', async () => {
    mockRunRpc.mockResolvedValue(loaded())
    draw()
    expect(await screen.findByTestId('club-page')).toHaveTextContent('Trio · ada,bea')
  })

  it('asks not to be shown a modal, because it shows its own', async () => {
    mockRunRpc.mockResolvedValue(loaded())
    draw()
    await screen.findByTestId('club-page')
    expect(mockRunRpc).toHaveBeenCalledWith(expect.anything(), { presentFaults: false })
  })

  it('draws the server-worded error page for a club that is not there', async () => {
    mockRunRpc.mockResolvedValue(refused('No club with that name', 'PN494'))
    draw()
    expect(await screen.findByText('No club with that name')).toBeInTheDocument()
    expect(screen.queryByTestId('club-page')).not.toBeInTheDocument()
  })

  it('tells that apart from a club that is not yours', async () => {
    // The distinction the RPC exists for: RLS collapses both into zero rows.
    mockRunRpc.mockResolvedValue(refused('You are not a member of this club', 'PN495'))
    draw()
    expect(await screen.findByText('You are not a member of this club')).toBeInTheDocument()
  })

  it('raises no modal over the error page', async () => {
    mockRunRpc.mockResolvedValue(refused('No club with that name', 'PN494'))
    draw()
    await screen.findByText('No club with that name')
    // A modal here would say the same sentence twice. Note the mocked `runRpc`
    // would not have raised one either, which is why the promise itself is
    // asserted at the call above rather than inferred from this.
    expect(peekFaultsForTest()).toEqual([])
  })

  it('screams at an answer it cannot read, and still leaves a page behind it', async () => {
    mockRunRpc.mockResolvedValue({ type: 'maybe' } as unknown as Envelope<never>)
    draw()
    await waitFor(() => expect(peekFaultsForTest()).toHaveLength(1))
    expect(screen.queryByTestId('club-page')).not.toBeInTheDocument()
    // Something true is behind the modal rather than a blank page.
    expect(screen.getByRole('heading')).toBeInTheDocument()
  })
})
