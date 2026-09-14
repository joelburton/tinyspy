// cs-audited-game-page

/**
 * Tests for the actions the game shell binds itself rather than leaving to a
 * game — the pause overlay's End game, New game from setup, and Back to club —
 * read through the binding stack the way the dispatcher and the key list read
 * them: what each says about itself as the game's state moves, and what its run
 * does. (Help is bound here too; it opens a modal and has no states to move
 * through, so it is not a subject of this file.)
 *
 * Mocked at the hook layer. `useCommonGame` is the one input that matters here
 * (paused, the club handle, the roster, whether the game is over), and the
 * rest — presence, the roster fetch, chat, the account menu — each open a
 * channel or a query that is nobody's subject in this file. The confirmation is
 * mocked too: whether a question was asked is the assertion, and the modal is
 * `ConfirmationHost.test.tsx`'s.
 */
import { act, render, screen } from '@testing-library/react'
import type { Session } from '@supabase/supabase-js'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { GameManifest } from '../manifest/gameManifest'
import type { Member } from '../members/member'
import { liveBindings, type BoundAction } from '../actions/useBoundAction'
import type { ActionId } from '../actions/registry'
import { NEW_GAME_CONFIRM } from '../floating-panels/confirmations'
import type { CommonGame, useCommonGame } from './useCommonGame'

const { mockUseCommonGame, mockNavigate, askConfirmation } = vi.hoisted(() => ({
  mockUseCommonGame: vi.fn(),
  mockNavigate: vi.fn(),
  askConfirmation: vi.fn(async (): Promise<'confirm' | 'alternative' | null> => 'confirm'),
}))

vi.mock('./useCommonGame', () => ({
  useCommonGame: (...args: unknown[]) => mockUseCommonGame(...args),
}))
vi.mock('../routing/router', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../routing/router')>()),
  navigate: mockNavigate,
}))
vi.mock('../floating-panels/confirmationService', () => ({
  askConfirmation: (...args: unknown[]) => askConfirmation(...(args as [])),
}))
// The pre-flight "does this game exist" read: one row, always.
vi.mock('../supabase/db', () => ({
  db: {
    from: () => ({
      select: () => ({
        eq: (_col: string, id: string) =>
          Promise.resolve({ data: [{ id }], error: null, status: 200 }),
      }),
    }),
  },
}))
vi.mock('../realtime/useClubPresence', () => ({ useClubPresence: () => [] }))
vi.mock('../realtime/useClubSetupPresence', () => ({ useClubSetupPresence: () => undefined }))
vi.mock('../club/useClubRoster', () => ({ useClubRoster: () => ({ members: [] }) }))
vi.mock('../account/useAccountMenuSection', () => ({
  useAccountMenuSection: () => ({ items: [] }),
}))
vi.mock('../chat/Chat', () => ({ Chat: () => null }))

import { GamePage } from './GamePage'

const GAME_ID = '11111111-2222-3333-4444-555555555555'
const ADA: Member = { user_id: 'ada', username: 'ada', color: 'red' }
const BEA: Member = { user_id: 'bea', username: 'bea', color: 'blue' }
const session = { user: { id: 'ada' } } as unknown as Session

const ENDED_OK = {
  type: 'ok', data: { result: 'ended' }, outcome: null, severity: null,
  message: null, field: null, meta: null, dbcode: null, detail: null,
} as const

/** The smallest manifest the shell will take. `endGame` is a spy so a test can
 *  assert it fired. */
function makeManifest(over: Partial<GameManifest> = {}): GameManifest {
  return {
    gametype: 'psychicnum_coop',
    schema: 'psychicnum',
    baseGametype: 'psychicnum',
    mode: 'coop',
    name: 'PsychicNum',
    shortDescription: 'Find the secret words',
    logoUrl: '',
    help: () => null,
    numberOfPlayers: [1, 6],
    PlayArea: () => null,
    setupForm: { Component: () => null, defaults: {} },
    startGameInClub: vi.fn(),
    labelFor: () => '',
    submitTimeout: vi.fn(),
    endGame: vi.fn(async () => ENDED_OK),
    ...over,
  }
}

type CommonGameState = ReturnType<typeof useCommonGame>

type Overrides = {
  paused?: boolean
  players?: Member[]
  game?: Partial<CommonGame> | null
}

/** What the mocked `useCommonGame` answers: a loaded, playing, solo game by
 *  default. `game: null` is the row not yet loaded (no club handle either). */
function commonGameState({ paused = false, players = [ADA], game = {} }: Overrides = {}) {
  const commonGame: CommonGame | null =
    game === null
      ? null
      : {
          id: GAME_ID,
          club_handle: 'moths',
          gametype: 'psychicnum_coop',
          title: 'Secrets',
          setup: {},
          is_current_view: true,
          play_state: 'playing',
          is_terminal: false,
          status: null,
          started_at: '2026-09-10T00:00:00Z',
          ended_at: null,
          current_turn_user_id: null,
          ...game,
        }
  return {
    commonGame,
    players,
    activePlayers: players,
    paused,
    presentUserIds: new Set(players.map((p) => p.user_id)),
    manuallyPausedBy: null,
    sendManualPause: vi.fn(),
    sendManualUnpause: vi.fn(),
    sendSuspend: vi.fn(),
    timer: { displaySeconds: 0, expired: false },
    isMyTurn: true,
    // `loading` false with a null row is the shape the page shows "no such
    // game" for; the tests that want a not-yet-loaded club handle keep the
    // row and blank the handle instead (see `withoutClub`).
    loading: false,
    failure: null,
  } as unknown as CommonGameState
}

/** The row is here but its club is not — the beat before the handle loads. */
const withoutClub: Overrides = { game: { club_handle: '' } }
const over: Overrides = { game: { ended_at: '2026-09-10T01:00:00Z', is_terminal: true } }

/** Mount the page over the pre-flight read; resolves once the play surface is
 *  up (or the pause overlay, when paused). */
async function mount(state = commonGameState(), manifest = makeManifest()) {
  mockUseCommonGame.mockReturnValue(state)
  const view = render(
    <GamePage gameId={GAME_ID} session={session} manifest={manifest}>
      {() => <div>play</div>}
    </GamePage>,
  )
  await act(async () => {
    await Promise.resolve()
  })
  return { view, state, manifest }
}

/** The page's binding for an id — the first in stack order, which is the one
 *  the dispatcher would fire. Only the page binds here, so there is one. */
function bound(id: ActionId): BoundAction {
  const found = liveBindings().find((b) => b.id === id)
  if (!found) throw new Error(`${id} is not bound`)
  return found
}

/** Drain an action's async run (confirm → callback). */
const flush = () => act(async () => { await new Promise((r) => setTimeout(r, 0)) })

beforeEach(() => {
  mockNavigate.mockClear()
  askConfirmation.mockClear()
  askConfirmation.mockResolvedValue('confirm')
})

describe('GamePage — mounting', () => {
  it('shows the play surface once the pre-flight read says the game is there', async () => {
    await mount()
    expect(screen.getByText('play')).toBeInTheDocument()
  })
})

describe('act-end-game, bound for the pause overlay', () => {
  it('is hidden while the game is playing — the PlayArea owns ⌥⌫ then', async () => {
    await mount()
    expect(bound('act-end-game').describe().state).toBe('hidden')
    // `describe()` is not "is it on screen": the overlay is up only when paused.
    expect(screen.queryByText('play')).toBeInTheDocument()
  })

  it('is active while paused', async () => {
    await mount(commonGameState({ paused: true }))
    expect(bound('act-end-game').describe().state).toBe('active')
    expect(screen.queryByText('play')).toBeNull()
  })

  it('asks, then fires the manifest endGame with the game id', async () => {
    const { manifest } = await mount(commonGameState({ paused: true }))
    act(() => bound('act-end-game').run())
    await flush()
    expect(askConfirmation).toHaveBeenCalledTimes(1)
    expect(manifest.endGame).toHaveBeenCalledWith(GAME_ID)
  })
})

describe('act-new-game-from-setup', () => {
  it('is hidden until the club handle is known, then active', async () => {
    const { view } = await mount(commonGameState(withoutClub))
    expect(bound('act-new-game-from-setup').describe().state).toBe('hidden')

    mockUseCommonGame.mockReturnValue(commonGameState())
    view.rerender(
      <GamePage gameId={GAME_ID} session={session} manifest={makeManifest()}>
        {() => <div>play</div>}
      </GamePage>,
    )
    expect(bound('act-new-game-from-setup').describe().state).toBe('active')
  })

  it('goes straight to the club page with ?new=<gametype> once the game is over', async () => {
    await mount(commonGameState(over))
    act(() => bound('act-new-game-from-setup').run())
    await flush()
    expect(askConfirmation).not.toHaveBeenCalled()
    expect(mockNavigate).toHaveBeenCalledWith('/c/moths?new=psychicnum_coop')
  })

  it('asks the new-game question first mid-game, and goes when answered yes', async () => {
    await mount()
    act(() => bound('act-new-game-from-setup').run())
    await flush()
    expect(askConfirmation).toHaveBeenCalledWith(NEW_GAME_CONFIRM)
    expect(mockNavigate).toHaveBeenCalledWith('/c/moths?new=psychicnum_coop')
  })

  it('stays put when the question is answered no', async () => {
    askConfirmation.mockResolvedValue(null)
    await mount()
    act(() => bound('act-new-game-from-setup').run())
    await flush()
    expect(mockNavigate).not.toHaveBeenCalled()
  })
})

describe('act-back-to-club', () => {
  it('navigates straight to the club once the game is over — leaving affects nobody', async () => {
    const { state } = await mount(commonGameState(over))
    act(() => bound('act-back-to-club').run())
    await flush()
    expect(mockNavigate).toHaveBeenCalledWith('/c/moths')
    expect(state.sendSuspend).not.toHaveBeenCalled()
  })

  it('suspends at once mid-game in a SOLO game — nobody to surprise', async () => {
    const { state } = await mount()
    act(() => bound('act-back-to-club').run())
    await flush()
    expect(state.sendSuspend).toHaveBeenCalledTimes(1)
    expect(mockNavigate).not.toHaveBeenCalled()
    expect(screen.queryByText('Suspend this game?')).toBeNull()
  })

  it('opens the suspend question mid-game with peers, and suspends on yes', async () => {
    const { state } = await mount(commonGameState({ players: [ADA, BEA] }))
    act(() => bound('act-back-to-club').run())
    await flush()
    expect(screen.getByText('Suspend this game?')).toBeInTheDocument()
    expect(state.sendSuspend).not.toHaveBeenCalled()

    await act(async () => {
      screen.getByRole('button', { name: 'Suspend' }).click()
    })
    expect(state.sendSuspend).toHaveBeenCalledTimes(1)
  })

  it('does nothing before the club handle is known', async () => {
    const { state } = await mount(commonGameState(withoutClub))
    act(() => bound('act-back-to-club').run())
    await flush()
    expect(mockNavigate).not.toHaveBeenCalled()
    expect(state.sendSuspend).not.toHaveBeenCalled()
  })
})
