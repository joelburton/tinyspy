// cs-unmet

/**
 * Render smoke tests for bananagrams' PlayArea: does the v3 play surface mount
 * and render without throwing — in solo play, compete play, at terminal, and in
 * the locally-terminal "you conceded" state?
 *
 * Why this exists: the v1→v3 conversion moved the whole layout onto the shared
 * scaffold and added the concede/locally-terminal branch — a class of bug a
 * one-line `render()` catches instantly (a stale prop reference ships a blank
 * page, which `tsc` on the root config would miss; see memory
 * project_typecheck_use_tsc_b). These are deliberately shallow: game logic lives
 * in pgTAP (the RPCs) and `lib/board.test.ts`; here we only prove the tree mounts.
 *
 * `useGame` / `useProgress` (realtime + supabase) and `db` are mocked, and jsdom
 * gets a `ResizeObserver` stub (PlayerBoard observes the arena to compute the
 * min zoom). Everything else — the arena, hand, dump, peel, info column, modal —
 * renders for real.
 */
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { GamePageCtx } from '@/common/game-page/gamePageCtx'
import { createFeedbackSlot } from '@/common/feedback/feedbackSlotStore'
import { gp } from '@/common/members/gamePlayer.fixture'
import { boundActionFixture } from '@/common/actions/boundAction.fixture'
import { useActionDispatcher } from '@/common/actions/dispatcher'
import { liveBindings } from '@/common/actions/useBoundAction'
import { ConfirmationHost } from '@/common/floating-panels/ConfirmationHost'
import { menuRow, type MenuSection } from '@/common/menu/menuModel'
import type { ProgressRow } from '../hooks/useGame'
import { db } from '../db'
import { PlayArea } from './PlayArea'

type GameHook = { initialBoard: string | null; tiles: string; loading: boolean }

// Mutable holders the mocked hooks return each render — set per test.
const h = vi.hoisted(() => ({
  game: null as unknown as GameHook,
  progress: [] as ProgressRow[],
}))
vi.mock('../hooks/useGame', () => ({
  useGame: () => h.game,
  useProgress: () => h.progress,
  // Peers' boards feed the PRINTOUT's per-player columns, nothing on screen —
  // so a smoke test never needs rows, only the export to exist.
  usePeerBoards: () => [],
}))
vi.mock('../db', () => ({ db: { rpc: vi.fn().mockResolvedValue({ data: null, error: null }) } }))

// jsdom has no ResizeObserver; PlayerBoard constructs one to size the zoom.
class RO {
  observe() {}
  unobserve() {}
  disconnect() {}
}
vi.stubGlobal('ResizeObserver', RO)

const EMPTY_BOARD = '.'.repeat(25 * 25)

/** A loaded game hook: an empty board + a hand of held tiles. */
function loaded(tiles = 'ABCDEFG'): GameHook {
  return { initialBoard: EMPTY_BOARD, tiles, loading: false }
}

function progressRow(over: Partial<ProgressRow> & { user_id: string }): ProgressRow {
  return { unplaced: 0, placed: 0, solved: false, ...over }
}

const SETUP = {
  hand_size: 21,
  bunch_size: 144,
  word_check: 'off',
  dict_2: 4,
  dict_3plus: 4,
  dump_to_bag: false,
  timer: { kind: 'none' },
}

function makeCtx(over: Partial<GamePageCtx> = {}): GamePageCtx {
  return {
    session: { user: { id: 'u1' } } as unknown as GamePageCtx['session'],
    gameId: 'g1',
    brand: 'MonkeyGrams',
    title: 'Test game',
    players: [gp('u1', 'me', 'red')],
    playState: 'playing',
    isTerminal: false,
    timer: { displaySeconds: 0, expired: false },
    isMyTurn: true,
    currentTurnUserId: null,
    setup: SETUP,
    status: { bunch_remaining: 100, bag_remaining: 0 },
    globalFeedbackSlot: createFeedbackSlot('global'),
    clubHandle: 'testclub',
    goToGame: vi.fn(),
    menu: {
      setGameSections: vi.fn(),
      actHelp: boundActionFixture('act-help'),
      actChat: boundActionFixture('act-open-chat'),
      actBackToClub: boundActionFixture('act-back-to-club'),
    },
    ...over,
  }
}

const rpc = db.rpc as unknown as ReturnType<typeof vi.fn>

/** An `ok` envelope in the shape `runRpc` unwraps — `data.result` is what the
 *  call sites branch on, so a stub without it is an answer they scream at. */
const okEnvelope = (data: unknown) => ({
  data: {
    type: 'ok', data, outcome: null, severity: null,
    message: null, field: null, meta: null, dbcode: null, detail: null,
  },
  error: null,
})

/** What PlayArea handed `menu.setGameSections`, as the ROWS the menu would
 *  draw, keyed by action id. */
function menuItems(ctx: GamePageCtx) {
  const setSections = ctx.menu.setGameSections as unknown as ReturnType<typeof vi.fn>
  const sections = (setSections.mock.calls.at(-1)?.[0] ?? []) as MenuSection[]
  return new Map(sections.flatMap((s) => s.items).map(menuRow).map((r) => [r.id, r]))
}

/** PlayArea under the app-root key dispatcher, which App.tsx mounts for real.
 *  Only the tests whose subject is a keystroke need it — a bare `render` binds
 *  the actions but has nothing feeding them keys. */
function WithKeys(props: React.ComponentProps<typeof PlayArea>) {
  useActionDispatcher()
  return <PlayArea {...props} />
}

/** A keystroke at the page, the way a player types with nothing focused.
 *  Awaited, because an action's run is single-flight: a second press before the
 *  first has settled is dropped. */
const press = (init: KeyboardEventInit) =>
  act(async () => {
    fireEvent.keyDown(document.body, init)
  })

/** What a bound action says about itself right now. */
const stateOf = (id: string) => liveBindings().find((b) => b.id === id)?.describe('button').state

beforeEach(() => {
  h.game = loaded()
  h.progress = [progressRow({ user_id: 'u1', unplaced: 7 })]
  rpc.mockReset()
  rpc.mockResolvedValue({ data: null, error: null })
})

describe('bananagrams PlayArea — render smoke', () => {
  it('renders the arena + hand + Concede in a solo game', () => {
    render(<PlayArea {...makeCtx()} />)
    expect(screen.getByText('Hand')).toBeInTheDocument()
    // Peel button always reads "Peel"; disabled while the hand isn't empty.
    expect(screen.getByRole('button', { name: 'Peel' })).toBeDisabled()
    expect(screen.getByRole('button', { name: /concede/i })).toBeInTheDocument()
  })

  it('renders the opponent strip in a compete game', () => {
    const two = [
      gp('u1', 'me', 'red'),
      gp('u2', 'moth', 'blue'),
    ]
    h.progress = [
      progressRow({ user_id: 'u1', unplaced: 7 }),
      progressRow({ user_id: 'u2', unplaced: 3 }),
    ]
    render(<PlayArea {...makeCtx({ players: two })} />)
    expect(screen.getByText('moth')).toBeInTheDocument()
  })

  it('renders the terminal win state (verdict + outcome line)', () => {
    render(
      <PlayArea
        {...makeCtx({ isTerminal: true, playState: 'won', status: { winner_username: 'me' } })}
      />,
    )
    // The short info-column outcome line + the fuller verdict in the below-board
    // pill. No modal carries the verdict — a WIN pops the celebration instead
    // (useCelebration fires on the false→true flip, not on mount, so a test that
    // renders straight into the terminal state sees no dialog).
    expect(screen.getByText('You won!')).toBeInTheDocument()
    expect(screen.getAllByText(/Bananas! You went out first/).length).toBeGreaterThan(0)
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  })

  it('renders the locally-terminal "you conceded" state (frozen, others racing)', () => {
    // Concede now lives on the common roster (ctx.players), not progress.
    h.progress = [progressRow({ user_id: 'u1' })]
    render(<PlayArea {...makeCtx({ players: [gp('u1', 'me', 'red', { conceded: true })] })} />)
    // The action row is the shared <InfoActionsRow> "You conceded" (the same
    // label every other game uses) — no Peel and no Concede, since the conceder
    // is frozen out and the row is the terminal look.
    expect(screen.getAllByText(/you conceded/i).length).toBeGreaterThan(0)
    expect(screen.queryByRole('button', { name: /concede/i })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Peel' })).not.toBeInTheDocument()
  })
})

/**
 * The commands through the dispatcher — `+`, `⌥⌫` and Restart — with the real
 * confirmation host mounted where a question is expected. A question asked
 * with no host is answered no, so the host is what lets these prove a question
 * was asked rather than skipped.
 *
 * bananagrams is the one race that can ALSO stop the whole table, so its
 * Concede asks the two-answer question and End hides behind it until a
 * conceder's Concede is spent.
 */
describe('bananagrams PlayArea — + and ⌥⌫ through the dispatcher', () => {
  const two = [gp('u1', 'me', 'red'), gp('u2', 'moth', 'blue')]

  it('the setup disclosure shows the shared rows, the same ones the PDF prints', () => {
    // Rendered from `setupRows`, not a hand-kept list — so the screen and the
    // paper cannot disagree on which way `dump_to_bag` goes.
    render(<PlayArea {...makeCtx({ setup: { ...SETUP, dump_to_bag: true, word_check: 'strict' } })} />)
    const recap = screen.getByText('Setup options').parentElement as HTMLElement
    expect(recap.textContent).toContain('Players: me')
    expect(recap.textContent).toContain('Dumped tiles: to the bag (out of play)')
    expect(recap.textContent).toContain('Word check: Every peel')
    expect(recap.textContent).toContain('Timer: none')
  })

  it('+ at terminal deals the next game with no question', async () => {
    rpc.mockImplementation((name: string) =>
      name === 'create_game'
        ? Promise.resolve(okEnvelope({ result: 'created', id: 'next-game-id' }))
        : Promise.resolve({ data: null, error: null }),
    )
    const ctx = makeCtx({ isTerminal: true, playState: 'won', status: { winner_username: 'me' } })
    render(<WithKeys {...ctx} />)
    await press({ key: '+' })
    // No <ConfirmationHost/> is mounted, so a question would have been answered
    // "no" — the RPC firing proves none was asked.
    await waitFor(() =>
      expect(rpc).toHaveBeenCalledWith('create_game', {
        target_club: 'testclub',
        setup: ctx.setup,
        player_user_ids: ['u1'],
      }),
    )
    await waitFor(() => expect(ctx.goToGame).toHaveBeenCalledWith('bananagrams', 'next-game-id'))
  })

  it('+ mid-game asks first, and cancel deals nothing', async () => {
    const user = userEvent.setup()
    render(
      <>
        <WithKeys {...makeCtx()} />
        <ConfirmationHost />
      </>,
    )
    await press({ key: '+' })
    expect(await screen.findByText('Start a new game?')).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Keep playing' }))
    await waitFor(() => expect(screen.queryByText('Start a new game?')).not.toBeInTheDocument())
    expect(rpc).not.toHaveBeenCalled()
  })

  it('⌥⌫ asks the two-answer question; "End for all" calls end_game', async () => {
    const user = userEvent.setup()
    rpc.mockResolvedValue(okEnvelope({ result: 'ended' }))
    h.progress = [progressRow({ user_id: 'u1', unplaced: 7 }), progressRow({ user_id: 'u2', unplaced: 3 })]
    render(
      <>
        <WithKeys {...makeCtx({ players: two })} />
        <ConfirmationHost />
      </>,
    )
    await press({ key: 'Backspace', code: 'Backspace', altKey: true })
    expect(await screen.findByText('Concede, or end the game?')).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'End for all' }))
    await waitFor(() => expect(rpc).toHaveBeenCalledWith('end_game', { target_game: 'g1' }))
    expect(rpc).not.toHaveBeenCalledWith('concede', expect.anything())
  })

  it('⌥⌫ then "Concede" calls concede, not end_game', async () => {
    const user = userEvent.setup()
    rpc.mockResolvedValue(okEnvelope({ result: 'conceded' }))
    h.progress = [progressRow({ user_id: 'u1', unplaced: 7 }), progressRow({ user_id: 'u2', unplaced: 3 })]
    render(
      <>
        <WithKeys {...makeCtx({ players: two })} />
        <ConfirmationHost />
      </>,
    )
    await press({ key: 'Backspace', code: 'Backspace', altKey: true })
    expect(await screen.findByText('Concede, or end the game?')).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Concede' }))
    await waitFor(() => expect(rpc).toHaveBeenCalledWith('concede', { target_game: 'g1' }))
    expect(rpc).not.toHaveBeenCalledWith('end_game', expect.anything())
  })

  it('End game hides behind Concede while racing, and comes out once I have conceded', () => {
    h.progress = [progressRow({ user_id: 'u1', unplaced: 7 }), progressRow({ user_id: 'u2', unplaced: 3 })]
    const { rerender } = render(<PlayArea {...makeCtx({ players: two })} />)
    expect(stateOf('act-end-game')).toBe('hidden')
    expect(stateOf('act-concede')).toBe('active')
    // The button follows the binding: only Concede draws.
    expect(document.querySelector('button[data-action="act-end-game"]')).toBeNull()
    expect(document.querySelector('button[data-action="act-concede"]')).not.toBeNull()

    // My Concede is spent, so it goes; ending the table is still open to me.
    h.progress = [progressRow({ user_id: 'u1' }), progressRow({ user_id: 'u2', unplaced: 3 })]
    rerender(<PlayArea {...makeCtx({ players: [gp('u1', 'me', 'red', { conceded: true }), two[1]] })} />)
    expect(stateOf('act-end-game')).toBe('active')
    expect(stateOf('act-concede')).toBe('hidden')
  })

  it('Restart mid-game asks, and goes straight through at terminal', async () => {
    const user = userEvent.setup()
    rpc.mockResolvedValue(okEnvelope({ result: 'replayed' }))
    const live = makeCtx()
    const { unmount } = render(
      <>
        <PlayArea {...live} />
        <ConfirmationHost />
      </>,
    )
    act(() => menuItems(live).get('act-restart')!.run())
    expect(await screen.findByText('Restart this game?')).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Keep playing' }))
    expect(rpc).not.toHaveBeenCalled()
    unmount()

    // No host this time: the RPC firing proves no question was asked. Restart
    // is a menu row only in bananagrams — the terminal row carries no twin.
    const done = makeCtx({ isTerminal: true, playState: 'won', status: { winner_username: 'me' } })
    render(<PlayArea {...done} />)
    act(() => menuItems(done).get('act-restart')!.run())
    await waitFor(() => expect(rpc).toHaveBeenCalledWith('replay_board', { target_game: 'g1' }))
  })
})
