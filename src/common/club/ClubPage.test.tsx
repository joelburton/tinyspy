// cs-blessed-club-page

/**
 * WHAT THE PAGE DECIDES, GIVEN A CLUB AND ITS GAMES.
 *
 * The load is `<ClubPageLoader>`'s and has its own file; the games read and its
 * subscription are `useClubGames`' and have theirs. What is left here is the
 * page's own judgment: which rows a filter leaves, that each filter reaches
 * only its own list, what a failed games read makes the empty state say, and
 * what a delete answer puts on screen.
 *
 * Mocking strategy
 * ----------------
 * `useClubGames` is mocked, which is the whole reason this file is small: the
 * games arrive as a value rather than as a read to be faked, so there is no
 * Realtime channel to stub, no `readRows`, and nothing to wait for. The hook's
 * own contract is `useClubGames.test.ts`.
 *
 * `runRpc` is still mocked, because deleting a game calls it from here.
 *
 * `@/gametypes` is a registry of three, not the real one, so a filter
 * assertion can name the rows it expects instead of counting them.
 */

import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { Session } from '@supabase/supabase-js'
import type { Envelope } from '../supabase/envelope'
import type { GameManifest } from '../manifest/gameManifest'
import type { ListedGame } from './useClubGames'

// The registry lives in `vi.hoisted` because `vi.mock('@/gametypes')`'s factory
// is lifted above the file's consts and would not see them otherwise.
const { mockRunRpc, mockToast, clubGames, WORDLE, DUEL, SYRUP } = vi.hoisted(() => {
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
    mockToast: vi.fn(),
    // What `useClubGames` hands the page, chosen per test.
    clubGames: {
      current: { games: [], currentGameId: null, failed: false } as {
        games: ListedGame[]
        currentGameId: string | null
        failed: boolean
      },
    },
    WORDLE: manifest('wordle_coop', 'coop', 'WordNerd'),
    DUEL: manifest('wordle_compete', 'compete', 'WordNerd'),
    SYRUP: manifest('syrup_coop', 'coop', 'SyrupSwap'),
  }
})

vi.mock('./useClubGames', () => ({ useClubGames: () => clubGames.current }))

vi.mock('../supabase/db', () => ({ db: { rpc: (name: string) => name } }))

vi.mock('../supabase/dbResult', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../supabase/dbResult')>()),
  runRpc: mockRunRpc,
}))

vi.mock('../toasts/toastStore', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../toasts/toastStore')>()),
  showToast: mockToast,
}))

vi.mock('../realtime/useClubPresence', () => ({ useClubPresence: () => [] }))
vi.mock('../realtime/useClubSetupPresence', () => ({ useClubSetupPresence: () => {} }))
vi.mock('../chat/Chat', () => ({ Chat: () => null }))
vi.mock('@/gametypes', () => ({ gametypes: [WORDLE, DUEL, SYRUP] }))

import { ClubPage } from './ClubPage'
import { clearFaultsForTest, peekFaultsForTest } from '../faults/faultStore'

// jsdom doesn't implement it, and SelectionList keeps its cursor row inside the
// frame with it.
Element.prototype.scrollIntoView = vi.fn()

const session = { user: { id: 'ada' } } as unknown as Session

const CLUB = { handle: 'trio', name: 'Trio', is_solo: false }
const MEMBERS = [
  { user_id: 'ada', username: 'ada', color: 'red' },
  { user_id: 'bea', username: 'bea', color: 'blue' },
]
const ENROLLED = [
  { gametype: 'wordle_coop', default_setup: null },
  { gametype: 'wordle_compete', default_setup: null },
  { gametype: 'syrup_coop', default_setup: null },
]

/** A listed game, as `useClubGames` would have built it. */
function listed(over: Partial<ListedGame> & { gameId: string; manifest: GameManifest }): ListedGame {
  return {
    title: `Game ${over.gameId}`,
    lastActiveAt: '2026-09-01T00:00:00Z',
    isTerminal: false,
    statusLabel: 'playing',
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

function draw(club = CLUB) {
  return render(
    <ClubPage club={club} members={MEMBERS} initialGametypes={ENROLLED} session={session} />,
  )
}

const startList = () => within(screen.getByRole('group', { name: 'Start a new game' }))
const gamesList = () => within(screen.getByRole('group', { name: 'Your games' }))

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
  mockToast.mockReset()
  clubGames.current = { games: [], currentGameId: null, failed: false }
  clearFaultsForTest()
  window.history.replaceState(null, '', '/c/trio')
})

describe('ClubPage — the two lists', () => {
  it('offers a start row per enrolled gametype', () => {
    draw()
    expect(startList().getAllByText('WordNerd')).toHaveLength(2)
    expect(startList().getByText('SyrupSwap')).toBeInTheDocument()
  })

  it('lists the games it was given, and calls the current one out as well', () => {
    clubGames.current = {
      games: [
        listed({ gameId: 'g1', manifest: WORDLE as unknown as GameManifest, title: 'Alpha' }),
        listed({ gameId: 'g2', manifest: SYRUP as unknown as GameManifest, title: 'Beta' }),
      ],
      currentGameId: 'g1',
      failed: false,
    }
    draw()

    expect(gamesList().getByText('Alpha')).toBeInTheDocument()
    expect(gamesList().getByText('Beta')).toBeInTheDocument()
    // The current game is a row like any other AND gets the card above.
    expect(screen.getByText('Join the current game')).toBeInTheDocument()
  })

  it('says the read failed rather than "No games yet."', () => {
    clubGames.current = { games: [], currentGameId: null, failed: true }
    draw()
    // An empty list that says "No games yet." is a lie when the read is what
    // came back empty — and this is a page the player is being told to reload.
    expect(emptyLine(gamesList())).toHaveTextContent('Could not load this club’s games.')
  })
})

describe('ClubPage — each filter reaches one list', () => {
  beforeEach(() => {
    clubGames.current = {
      games: [
        listed({ gameId: 'g1', manifest: WORDLE as unknown as GameManifest, title: 'Alpha' }),
        listed({ gameId: 'g2', manifest: SYRUP as unknown as GameManifest, title: 'Beta' }),
      ],
      currentGameId: null,
      failed: false,
    }
  })

  it('the mode filter narrows the start list and leaves the games list alone', async () => {
    draw()
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
    render(
      <ClubPage
        club={CLUB}
        members={MEMBERS}
        initialGametypes={[{ gametype: 'wordle_coop', default_setup: null }]}
        session={session}
      />,
    )
    await userEvent.click(
      headingRow('Start a new game').getByRole('button', { name: 'Compete' }),
    )
    expect(emptyLine(startList())).toHaveTextContent('No Compete games in this club.')
  })

  it('a solo club gets no mode filter, and is pinned to all', () => {
    draw({ ...CLUB, is_solo: true })
    expect(
      headingRow('Start a new game').queryByRole('button', { name: 'Compete' }),
    ).not.toBeInTheDocument()
    expect(startList().getAllByText('WordNerd')).toHaveLength(2)
    expect(startList().getByText('SyrupSwap')).toBeInTheDocument()
  })
})

describe('ClubPage — what a delete answer puts on screen', () => {
  /**
   * Press the trash can on the one listed game, then confirm. The button is a
   * two-step: the first press turns "Delete game" into "Confirm delete?" and
   * only the second calls the RPC, so a misclick can be ignored rather than
   * needing a Cancel to find.
   */
  async function deleteTheGame() {
    await userEvent.click(gamesList().getByRole('button', { name: 'Delete game' }))
    await userEvent.click(gamesList().getByRole('button', { name: 'Confirm delete?' }))
  }

  beforeEach(() => {
    clubGames.current = {
      games: [listed({ gameId: 'g1', manifest: WORDLE as unknown as GameManifest, title: 'Alpha' })],
      currentGameId: null,
      failed: false,
    }
  })

  it('toasts the title on a successful delete', async () => {
    draw()
    mockRunRpc.mockResolvedValue(ok({ result: 'deleted' }))
    await deleteTheGame()

    // The title is looked up BEFORE the refetch sweeps the row out of the list.
    expect(mockToast).toHaveBeenCalledWith(
      expect.objectContaining({ message: 'Alpha deleted', tone: 'success' }),
    )
  })

  it('toasts a not-ok and lets the button back out', async () => {
    draw()
    mockRunRpc.mockResolvedValue(notOk('That game no longer exists', 'PN013'))
    await deleteTheGame()

    // EVERY severity gets the toast, a fault included: the modal runRpc raised
    // is dismissable, and this is what survives dismissing it.
    expect(mockToast).toHaveBeenCalledWith(
      expect.objectContaining({ message: 'That game no longer exists', tone: 'error' }),
    )
    // The throw is what returns the button to idle rather than stranding it on
    // "Deleting…" with the game still listed.
    expect(await gamesList().findByRole('button', { name: 'Delete game' })).toBeInTheDocument()
  })

  it('screams at an answer it has no branch for', async () => {
    draw()
    mockRunRpc.mockResolvedValue(ok({ result: 'something-new' }))
    await deleteTheGame()

    expect(peekFaultsForTest()).toHaveLength(1)
    expect(mockToast).not.toHaveBeenCalled()
  })
})
