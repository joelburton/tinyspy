// cs-blessed-game-page

/**
 * Tests for the actions the game shell binds itself rather than leaving to a
 * game — the pause overlay's End game, New game from setup, and Back to club —
 * read through the binding stack the way the dispatcher and the key list read
 * them: what each says about itself as the game's state moves, and what its run
 * does. (Help is bound here too; it opens a companion and has no states to
 * move through, so it is not a subject of this file.)
 *
 * Mocked at the hook layer. `useCommonGame` is the one input that matters here
 * (paused, the club handle, the roster, whether the game is over), and the
 * rest — presence, the roster fetch, chat, the account menu — each open a
 * channel or a query that is nobody's subject in this file. The confirmation is
 * mocked too: whether a question was asked is the assertion, and the modal is
 * `ConfirmationHost.test.tsx`'s.
 */
import { useEffect } from 'react'
import { act, render, screen } from '@testing-library/react'
import type { Session } from '@supabase/supabase-js'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { GameManifest } from '../manifest/gameManifest'
import type { Member } from '../members/member'
import { liveBindings, type BoundAction } from '../actions/useBoundAction'
import type { ActionId } from '../actions/registry'
import { NEW_GAME_CONFIRM } from '../floating-panels/confirmations'
import { suspendConfirm } from '../pause-suspend/suspendConfirm'
import type { CommonGame, useCommonGame } from './useCommonGame'

const { mockUseCommonGame, mockNavigate, askConfirmation, mockManifestFor } = vi.hoisted(() => ({
  mockUseCommonGame: vi.fn(),
  mockNavigate: vi.fn(),
  askConfirmation: vi.fn(async (): Promise<'confirm' | 'alternative' | null> => 'confirm'),
  mockManifestFor: vi.fn(),
}))

// The gate resolves the URL's gametype through the registry, so a test supplies
// its manifest here rather than as a prop.
vi.mock('@/gametypes', () => ({ manifestFor: (g: string) => mockManifestFor(g) }))

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

import { GamePageGate } from './GamePageGate'

const GAME_ID = '11111111-2222-3333-4444-555555555555'
const GAMETYPE = 'psychicnum_coop'
const ADA: Member = { user_id: 'ada', username: 'ada', color: 'red' }
const BEA: Member = { user_id: 'bea', username: 'bea', color: 'blue' }
const session = { user: { id: 'ada' } } as unknown as Session

const ENDED_OK = {
  type: 'ok', data: { result: 'ended' }, outcome: null, severity: null,
  message: null, field: null, meta: null, dbcode: null, detail: null,
} as const

/** The smallest manifest the shell will take. `endGame` is a spy so a test can
 *  assert it fired, and `PlayArea` draws a word the mounting tests look for —
 *  the shell builds the play surface off the manifest, so this IS how a test
 *  sees that the surface is up. */
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
    PlayArea: () => <div>play</div>,
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
 *  default. `game: null` is the row gone, which the loader turns into the "no
 *  such game" card rather than passing down. */
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
          restarts: 0,
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
    // `loading` false with a null row is the shape `GamePageLoader` shows "no
    // such game" for. The page below it never sees that combination.
    loading: false,
    failure: null,
  } as unknown as CommonGameState
}

const over: Overrides = { game: { ended_at: '2026-09-10T01:00:00Z', is_terminal: true } }

/** Mount the whole route — gate, loader, page — over the pre-flight read;
 *  resolves once the play surface is up (or the pause overlay, when paused). */
async function mount(state = commonGameState(), manifest = makeManifest()) {
  mockUseCommonGame.mockReturnValue(state)
  mockManifestFor.mockReturnValue(manifest)
  const view = render(
    <GamePageGate urlGametype={GAMETYPE} gameId={GAME_ID} session={session} />,
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

  it('starts over when the URL names a DIFFERENT game — the surface remounts', async () => {
    // Reachable from inside a game: the invitation toast is mounted in App, so
    // `join` navigates /g/<type>/A → /g/<type>/B, which changes this route's
    // params without unmounting it. The gate is what has to notice, because
    // GamePage keys the surface on `restarts` — right for a restart, silent
    // about a different game — and a game's own useGame hook refetches on
    // `gameId` without clearing what it already holds. So without the gate
    // going back to 'checking', the player reads game A's board under B's URL.
    let mounts = 0
    const Counting = () => {
      useEffect(() => {
        mounts += 1
      }, [])
      return <div>play</div>
    }
    const { view } = await mount(commonGameState(), makeManifest({ PlayArea: Counting }))
    expect(mounts).toBe(1)

    const OTHER_GAME = '99999999-8888-7777-6666-555555555555'
    view.rerender(
      <GamePageGate urlGametype={GAMETYPE} gameId={OTHER_GAME} session={session} />,
    )
    // Before the new read answers, the old surface must already be gone.
    expect(screen.queryByText('play')).toBeNull()

    await act(async () => { await Promise.resolve() })
    expect(mounts).toBe(2)
  })

  it('says so when the URL names a gametype the registry has never heard of', async () => {
    // A different screen from the calm "no game here" card on purpose: the app
    // cannot name the thing the link asks for, which is a fault, not a 404.
    mockUseCommonGame.mockReturnValue(commonGameState())
    mockManifestFor.mockReturnValue(undefined)
    render(<GamePageGate urlGametype="noodle" gameId={GAME_ID} session={session} />)
    await act(async () => { await Promise.resolve() })
    expect(screen.getByText(/There's no game type called/)).toBeInTheDocument()
    expect(screen.getByText('noodle')).toBeInTheDocument()
    expect(screen.queryByText('play')).toBeNull()
  })
})

describe('act-end-game, bound for the pause overlay', () => {
  it('mounts a NEW play surface when the game is restarted', async () => {
    // The whole restart mechanism: a game's local state is cleared by the
    // surface being replaced, not by the game cleaning up after itself. A
    // PlayArea that counts its own mounts is the only way to see it.
    let mounts = 0
    const Counting = () => {
      useEffect(() => {
        mounts += 1
      }, [])
      return <div>play</div>
    }
    const { view } = await mount(commonGameState(), makeManifest({ PlayArea: Counting }))
    expect(mounts).toBe(1)

    // A row arriving with the same run does NOT remount it — only the run
    // changing does, or every refetch would throw the board away.
    mockUseCommonGame.mockReturnValue(commonGameState({ game: { title: 'Secrets II' } }))
    view.rerender(<GamePageGate urlGametype={GAMETYPE} gameId={GAME_ID} session={session} />)
    await act(async () => { await Promise.resolve() })
    expect(mounts).toBe(1)

    mockUseCommonGame.mockReturnValue(commonGameState({ game: { restarts: 1 } }))
    view.rerender(<GamePageGate urlGametype={GAMETYPE} gameId={GAME_ID} session={session} />)
    await act(async () => { await Promise.resolve() })
    expect(mounts).toBe(2)
  })

  it('is hidden while the game is playing — the PlayArea owns ⌥⌫ then', async () => {
    await mount()
    expect(bound('act-end-game').describe('button').state).toBe('hidden')
    // `describe()` is not "is it on screen": the overlay is up only when paused.
    expect(screen.queryByText('play')).toBeInTheDocument()
  })

  it('is active while paused', async () => {
    await mount(commonGameState({ paused: true }))
    expect(bound('act-end-game').describe('button').state).toBe('active')
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
  // Active from the first render: `GamePageLoader` does not render the page
  // without a row, and a row always carries its club, so there is no beat where
  // the handle is still unknown.
  it('is active on a loaded game', async () => {
    await mount()
    expect(bound('act-new-game-from-setup').describe('button').state).toBe('active')
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
    expect(askConfirmation).not.toHaveBeenCalled()
  })

  it('asks the suspend question mid-game with peers, and suspends on yes', async () => {
    const { state } = await mount(commonGameState({ players: [ADA, BEA] }))
    act(() => bound('act-back-to-club').run())
    await flush()
    // The words name the game, so the question is built per title rather than
    // being a constant to compare against.
    expect(askConfirmation).toHaveBeenCalledWith(suspendConfirm('Secrets'))
    expect(state.sendSuspend).toHaveBeenCalledTimes(1)
  })

  it('stays in the game when the suspend question is answered no', async () => {
    askConfirmation.mockResolvedValue(null)
    const { state } = await mount(commonGameState({ players: [ADA, BEA] }))
    act(() => bound('act-back-to-club').run())
    await flush()
    expect(state.sendSuspend).not.toHaveBeenCalled()
    expect(mockNavigate).not.toHaveBeenCalled()
  })

})
