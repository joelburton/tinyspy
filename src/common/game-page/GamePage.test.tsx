// cs-blessed-game-page

/**
 * Tests for the actions the game shell binds itself rather than leaving to a
 * game — the pause overlay's Stop game, New game from setup, and Back to club —
 * read through the action stack the way the dispatcher and the key list read
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
import { type Action } from '../actions/useBindAction'
import { getActions } from '../actions/actionsStore'
import type { ActionId } from '../actions/registry'
import { NEW_GAME_CONFIRM } from '../floating-panels/confirmations'
import { suspendConfirm } from '../pause-suspend/suspendConfirm'
import type { useCommonGame } from './useCommonGame'
import type { Shell, ShellPlayer } from './shell'

const { mockUseCommonGame, mockNavigate, askConfirmation, mockManifestFor, mockShowToast, roster, seat } =
  vi.hoisted(() => ({
    mockUseCommonGame: vi.fn(),
    mockNavigate: vi.fn(),
    askConfirmation: vi.fn(async (): Promise<'confirm' | 'alternative' | null> => 'confirm'),
    mockManifestFor: vi.fn(),
    mockShowToast: vi.fn(),
    // What the roster fetch answers; a test sets `failure` to fail it.
    roster: { members: [] as unknown[], failure: null as unknown },
    // Whether the shell_data the gate reads seats the signed-in user.
    seat: { seated: true },
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
// The gate's one pre-flight read: the game's row with its shell_data, whose roster
// seats the signed-in user unless a test clears `seat.seated`. The builder is
// a thenable that takes any number of `.eq`s, as the real one does.
vi.mock('../supabase/db', () => ({
  db: {
    from: () => ({
      select: () => {
        const players = seat.seated ? [{ id: 'ada' }] : []
        const rows = [{ id: 'the-game', club_handle: 'moths', shell_data: { players } }]
        const query = {
          eq: () => query,
          then: (resolve: (settled: unknown) => void) =>
            resolve({ data: rows, error: null, status: 200 }),
        }
        return query
      },
    }),
  },
}))
vi.mock('../toasts/toastStore', () => ({ showToast: mockShowToast }))
vi.mock('../realtime/useClubPresence', () => ({ useClubPresence: () => [] }))
vi.mock('../realtime/useClubSetupPresence', () => ({ useClubSetupPresence: () => undefined }))
vi.mock('../club/useClubRoster', () => ({ useClubRoster: () => roster }))
vi.mock('../account/useAccountMenuSection', () => ({
  useAccountMenuSection: () => ({ items: [] }),
}))
vi.mock('../chat/ChatHost', () => ({ ChatHost: () => null }))

import { GamePageGate } from './GamePageGate'

const GAME_ID = '11111111-2222-3333-4444-555555555555'
const GAMETYPE = 'psychicnum_coop'
const ADA: ShellPlayer = { id: 'ada', username: 'ada', color: 'red', ai: false, stillPlaying: true }
const BEA: ShellPlayer = { id: 'bea', username: 'bea', color: 'blue', ai: false, stillPlaying: true }
const authSession = { user: { id: 'ada' } } as unknown as Session

const ENDED_OK = {
  type: 'ok', data: { result: 'ended' }, outcome: null, severity: null,
  message: null, field: null, meta: null, dbcode: null, detail: null,
} as const

/** The smallest manifest the shell will take. `stopGame` is a spy so a test can
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
    draftsOffTurn: false,
    scratchpad: 'none',
    PlayArea: () => <div>play</div>,
    setupForm: { Component: () => null, defaults: {} },
    startGameInClub: vi.fn(),
    summaryFor: () => '',
    submitTimeout: vi.fn(),
    stopGame: vi.fn(async () => ENDED_OK),
    ...over,
  }
}

type CommonGameState = ReturnType<typeof useCommonGame>

type Overrides = {
  paused?: boolean
  players?: ShellPlayer[]
  game?: Partial<Shell> | null
}

/** What the mocked `useCommonGame` answers: a loaded, playing, solo game by
 *  default. `game: null` is the row gone, which the loader turns into the "no
 *  such game" card rather than passing down. */
function commonGameState({ paused = false, players = [ADA], game = {} }: Overrides = {}): CommonGameState {
  const shell: Shell | null =
    game === null
      ? null
      : {
          id: GAME_ID,
          gametype: 'psychicnum_coop',
          club: { handle: 'moths' },
          title: 'Secrets',
          restartCount: 0,
          ended: false,
          players,
          ...game,
        }
  return {
    // Ada's seat is her entry, as the hook finds it.
    cg: shell === null ? null : { ...shell, me: shell.players[0]! },
    gameData: null,
    pause: {
      paused,
      presentUserIds: new Set(players.map((p) => p.id)),
      stillPlayingHumanPlayers: players,
      manuallyPausedBy: null,
      sendManualPause: vi.fn(),
      sendManualUnpause: vi.fn(),
    },
    timer: { mode: { kind: 'none' }, displaySeconds: 0, expired: false },
    sendSuspend: vi.fn(),
    // `loading` false with a null shell_data is the shape `GamePageLoader` shows "no
    // such game" for. The page below it never sees that combination.
    loading: false,
    failure: null,
  }
}

const over: Overrides = { game: { ended: true } }

/** Mount the whole route — gate, loader, page — over the pre-flight read;
 *  resolves once the play surface is up (or the pause overlay, when paused). */
async function mount(state = commonGameState(), manifest = makeManifest()) {
  mockUseCommonGame.mockReturnValue(state)
  mockManifestFor.mockReturnValue(manifest)
  const view = render(
    <GamePageGate urlGametype={GAMETYPE} gameId={GAME_ID} auth={authSession} />,
  )
  await act(async () => {
    await Promise.resolve()
  })
  return { view, state, manifest }
}

/** The page's action for an id — the first in stack order, which is the one
 *  the dispatcher would fire. Only the page binds here, so there is one. */
function getAction(id: ActionId): Action {
  const found = getActions().find((action) => action.id === id)
  if (!found) throw new Error(`${id} is not bound`)
  return found
}

/** Drain an action's async run (confirm → callback). */
const flush = () => act(async () => { await new Promise((r) => setTimeout(r, 0)) })

beforeEach(() => {
  roster.failure = null
  seat.seated = true
  mockNavigate.mockClear()
  mockShowToast.mockClear()
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
    // GamePage keys the surface on `restartCount` — right for a restart,
    // silent about a different game — and a game's own useGame hook refetches
    // on `gameId` without clearing what it already holds. So without the gate
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
      <GamePageGate urlGametype={GAMETYPE} gameId={OTHER_GAME} auth={authSession} />,
    )
    // Before the new read answers, the old surface must already be gone.
    expect(screen.queryByText('play')).toBeNull()

    await act(async () => { await Promise.resolve() })
    expect(mounts).toBe(2)
  })

  it('sends a member with no seat in the game back to the club, and says why', async () => {
    // There is no spectating: a club member can read the game's rows, but only
    // a player opens its page. The seat is read off shell_data's roster. Nothing
    // of the game mounts first — the loader joins the room and asserts the
    // current view, and a watcher must do neither — and the navigation
    // REPLACES, so Back does not bounce them in again.
    seat.seated = false
    await mount()
    expect(screen.queryByText('play')).toBeNull()
    expect(mockNavigate).toHaveBeenCalledWith('/c/moths', true)
    expect(mockShowToast.mock.calls[0]![0]!.message).toBe("You're not in this game")
  })

  it('says so when the URL names a gametype the registry has never heard of', async () => {
    // A different screen from the calm "no game here" card on purpose: the app
    // cannot name the thing the link asks for, which is a fault, not a 404.
    mockUseCommonGame.mockReturnValue(commonGameState())
    mockManifestFor.mockReturnValue(undefined)
    render(<GamePageGate urlGametype="noodle" gameId={GAME_ID} auth={authSession} />)
    await act(async () => { await Promise.resolve() })
    expect(screen.getByText(/There's no game type called/)).toBeInTheDocument()
    expect(screen.getByText('noodle')).toBeInTheDocument()
    expect(screen.queryByText('play')).toBeNull()
  })
})

describe('GamePage — a roster that failed to load', () => {
  it('keeps a short line in the header after the fault modal, saying to refresh', async () => {
    // The page has no local slot, so the header's global one carries it; the
    // modal itself is `readRows`' and is not this file's subject.
    roster.failure = {
      type: 'not-ok', data: null, outcome: null, severity: 'fault',
      message: 'The read failed.', field: null, meta: null, dbcode: null, detail: null,
    }
    await mount()
    expect(screen.getByText("Couldn't load. Refresh page.")).toBeInTheDocument()
  })

  it('says nothing when the roster loads', async () => {
    await mount()
    expect(screen.queryByText("Couldn't load. Refresh page.")).not.toBeInTheDocument()
  })
})

describe('act-stop-game, bound for the pause overlay', () => {
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

    // A shell_data arriving with the same run does NOT remount it — only the run
    // changing does, or every refetch would throw the board away.
    mockUseCommonGame.mockReturnValue(commonGameState({ game: { title: 'Secrets II' } }))
    view.rerender(<GamePageGate urlGametype={GAMETYPE} gameId={GAME_ID} auth={authSession} />)
    await act(async () => { await Promise.resolve() })
    expect(mounts).toBe(1)

    mockUseCommonGame.mockReturnValue(commonGameState({ game: { restartCount: 1 } }))
    view.rerender(<GamePageGate urlGametype={GAMETYPE} gameId={GAME_ID} auth={authSession} />)
    await act(async () => { await Promise.resolve() })
    expect(mounts).toBe(2)
  })

  it('is hidden while the game is playing — the PlayArea owns ⌥⌫ then', async () => {
    await mount()
    expect(getAction('act-stop-game').describe('button').state).toBe('hidden')
    // `describe()` is not "is it on screen": the overlay is up only when paused.
    expect(screen.queryByText('play')).toBeInTheDocument()
  })

  it('is active while paused', async () => {
    await mount(commonGameState({ paused: true }))
    expect(getAction('act-stop-game').describe('button').state).toBe('active')
    expect(screen.queryByText('play')).toBeNull()
  })

  it('asks, then fires the manifest stopGame with the game id', async () => {
    const { manifest } = await mount(commonGameState({ paused: true }))
    act(() => getAction('act-stop-game').run())
    await flush()
    expect(askConfirmation).toHaveBeenCalledTimes(1)
    expect(manifest.stopGame).toHaveBeenCalledWith(GAME_ID)
  })
})

describe('act-new-game-from-setup', () => {
  // Active from the first render: `GamePageLoader` does not render the page
  // without shell_data, and shell_data always carries its club, so there is no beat
  // where the handle is still unknown.
  it('is active on a loaded game', async () => {
    await mount()
    expect(getAction('act-new-game-from-setup').describe('button').state).toBe('active')
  })

  it('goes straight to the club page with ?new=<gametype> once the game is over', async () => {
    await mount(commonGameState(over))
    act(() => getAction('act-new-game-from-setup').run())
    await flush()
    expect(askConfirmation).not.toHaveBeenCalled()
    expect(mockNavigate).toHaveBeenCalledWith('/c/moths?new=psychicnum_coop')
  })

  it('asks the new-game question first mid-game, and goes when answered yes', async () => {
    await mount()
    act(() => getAction('act-new-game-from-setup').run())
    await flush()
    expect(askConfirmation).toHaveBeenCalledWith(NEW_GAME_CONFIRM)
    expect(mockNavigate).toHaveBeenCalledWith('/c/moths?new=psychicnum_coop')
  })

  it('stays put when the question is answered no', async () => {
    askConfirmation.mockResolvedValue(null)
    await mount()
    act(() => getAction('act-new-game-from-setup').run())
    await flush()
    expect(mockNavigate).not.toHaveBeenCalled()
  })
})

describe('act-back-to-club', () => {
  it('navigates straight to the club once the game is over — leaving affects nobody', async () => {
    const { state } = await mount(commonGameState(over))
    act(() => getAction('act-back-to-club').run())
    await flush()
    expect(mockNavigate).toHaveBeenCalledWith('/c/moths')
    expect(state.sendSuspend).not.toHaveBeenCalled()
  })

  it('suspends at once mid-game in a SOLO game — nobody to surprise', async () => {
    const { state } = await mount()
    act(() => getAction('act-back-to-club').run())
    await flush()
    expect(state.sendSuspend).toHaveBeenCalledTimes(1)
    expect(mockNavigate).not.toHaveBeenCalled()
    expect(askConfirmation).not.toHaveBeenCalled()
  })

  it('asks the suspend question mid-game with peers, and suspends on yes', async () => {
    const { state } = await mount(commonGameState({ players: [ADA, BEA] }))
    act(() => getAction('act-back-to-club').run())
    await flush()
    // The words name the game, so the question is built per title rather than
    // being a constant to compare against.
    expect(askConfirmation).toHaveBeenCalledWith(suspendConfirm('Secrets'))
    expect(state.sendSuspend).toHaveBeenCalledTimes(1)
  })

  it('stays in the game when the suspend question is answered no', async () => {
    askConfirmation.mockResolvedValue(null)
    const { state } = await mount(commonGameState({ players: [ADA, BEA] }))
    act(() => getAction('act-back-to-club').run())
    await flush()
    expect(state.sendSuspend).not.toHaveBeenCalled()
    expect(mockNavigate).not.toHaveBeenCalled()
  })
})
