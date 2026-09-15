// cs-unmet

/**
 * Render smoke tests for scrabble's PlayArea: does the play surface mount and
 * render without throwing — in coop, in compete, and at terminal?
 *
 * Why this exists: the v1→v3 conversion rewired the whole component (shared
 * scaffold, the below-board rack/commit row, the commit-slot local feedback, the
 * info column). A blank-page runtime error here wouldn't be caught by `tsc` (the
 * root tsconfig checks nothing — see memory project_typecheck_use_tsc_b), so a
 * one-line `render()` per mode is the guard. Deliberately shallow: the game logic
 * lives in pgTAP (the RPCs) + the lib Vitest suites (board / play); here we only
 * prove the tree mounts.
 *
 * `useGame` (realtime + supabase) and `db` are mocked so no client/network is
 * needed; everything else — the board, rack, controls, log, modal — renders real.
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
import type { PlayRow, PlayerRow, ScrabbleGame } from '../hooks/useGame'
import { db } from '../db'
import { PlayArea } from './PlayArea'

const rpc = db.rpc as unknown as ReturnType<typeof vi.fn>

type GameHook = ReturnType<typeof import('../hooks/useGame').useGame>

// A mutable holder the mocked useGame returns each render — set per test before
// render(). `vi.hoisted` runs before the (also-hoisted) `vi.mock` factory.
const h = vi.hoisted(() => ({ result: null as unknown as GameHook }))
vi.mock('../hooks/useGame', () => ({ useGame: () => h.result }))
vi.mock('../db', () => ({ db: { rpc: vi.fn() } }))
// The coop "show a move" transport opens a real Broadcast channel; stub it so the
// render tests never hit the network (a real `supabase.channel().subscribe()`
// throws an undici WebSocket error under jsdom). The stub captures the `onReceive`
// callback so a test can simulate an incoming broadcast (the cross-client wire
// itself is exercised in the e2e).
const sm = vi.hoisted(() => ({
  onReceive: null as null | ((p: unknown) => void),
  shareMove: vi.fn(),
}))
vi.mock('../hooks/useSharedMove', () => ({
  useSharedMove: (opts: { onReceive: (p: unknown) => void }) => {
    sm.onReceive = opts.onReceive
    return { shareMove: sm.shareMove }
  },
}))

const RACK = ['A', 'B', 'C', 'D', 'E', 'F', 'G']

/** A loaded game header; override the mode + per-mode fields per test. */
function loadedGame(over: Partial<ScrabbleGame> = {}): ScrabbleGame {
  return {
    id: 'g1',
    club_handle: 'c1',
    mode: 'coop',
    board: Array(225).fill(null),
    version: 0,
    bagCount: 86,
    sharedRack: RACK,
    teamScore: 0,
    currentSeat: null,
    currentUserId: null,
    ...over,
  }
}

function selfPlayer(over: Partial<PlayerRow> = {}): PlayerRow {
  return { user_id: 'u1', seat: 0, score: null, rack: null, rack_count: 7, ai_level: null, ...over }
}

function loaded(game: ScrabbleGame, players: PlayerRow[], plays: PlayRow[] = []): GameHook {
  return { game, players, plays, loading: false, failure: null }
}

/** A committed word play, for the move log / turn viewer. */
function wordPlay(over: Partial<PlayRow> = {}): PlayRow {
  return {
    user_id: 'u1',
    seat: 0,
    seq: 1,
    kind: 'word',
    placements: [{ x: 7, y: 7, letter: 'C', blank: false }, { x: 8, y: 7, letter: 'A', blank: false }, { x: 9, y: 7, letter: 'T', blank: false }],
    words: ['cat'],
    score: 10,
    tile_count: null,
    played_at: '2026-01-01',
    ...over,
  }
}

const twoMembers = [gp('u1', 'me', 'red'), gp('u2', 'moth', 'blue')]

function makeCtx(over: Partial<GamePageCtx> = {}): GamePageCtx {
  return {
    session: { user: { id: 'u1' } } as unknown as GamePageCtx['session'],
    gameId: 'g1',
    brand: 'RackAttack',
    title: 'SCOWL · TABLE · QUARTZ',
    players: [gp('u1', 'me', 'red')],
    playState: 'playing',
    isTerminal: false,
    timer: { displaySeconds: 0, expired: false },
    isMyTurn: true,
    currentTurnUserId: null,
    setup: { dict_2: 3, dict_3plus: 3, timer: { kind: 'none' } },
    status: null,
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
  } as unknown as GamePageCtx
}

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
const describeOf = (id: string) => liveBindings().find((b) => b.id === id)?.describe('button')

/** A control by WHICH action it is, since its words vary per state. */
const control = (id: string) => document.querySelector<HTMLButtonElement>(`button[data-action="${id}"]`)

beforeEach(() => {
  h.result = loaded(loadedGame(), [selfPlayer()])
  rpc.mockReset()
  rpc.mockResolvedValue({ error: null })
})

/** A loaded compete game with two seated players (u1 + u2). */
function loadedCompete(over: Partial<ScrabbleGame> = {}) {
  return loaded(
    loadedGame({ mode: 'compete', sharedRack: null, teamScore: null, currentSeat: 0, currentUserId: 'u1', ...over }),
    [selfPlayer({ score: 0, rack: RACK }), { user_id: 'u2', seat: 1, score: 0, rack: null, rack_count: 7, ai_level: null }],
  )
}

describe('scrabble PlayArea — render smoke', () => {
  it('renders the 15×15 board + the 7-tile rack + state line in coop play', () => {
    const { container } = render(<PlayArea {...makeCtx()} />)
    expect(container.querySelectorAll('[data-cell]')).toHaveLength(225)
    // The rack must render its tiles — a regression guard: the display `order`
    // starts empty and is seeded by the version-move effect; if that seeding is
    // skipped the rack renders no tiles (the brown tray bug).
    expect(container.querySelectorAll('[data-rack-tile]')).toHaveLength(7)
    // The state line (coop): "Team score: 0 · 86 in bag". TWO copies — the info
    // column's and the mobile status bar's, which render the same <StateLine>
    // (only one is visible at a time, by CSS; jsdom has no media queries).
    expect(screen.getAllByText(/in bag/)).toHaveLength(2)
    expect(screen.getAllByText(/Team score:/)).toHaveLength(2)
  })

  it('renders the OpponentStrip (Score) + rack in compete play', () => {
    h.result = loaded(
      loadedGame({ mode: 'compete', sharedRack: null, teamScore: null, currentUserId: 'u1' }),
      [selfPlayer({ score: 0, rack: RACK }), { user_id: 'u2', seat: 1, score: 0, rack: null, rack_count: 7, ai_level: null }],
    )
    const { container } = render(<PlayArea {...makeCtx({ players: twoMembers })} />)
    expect(screen.getByText('Score:')).toBeInTheDocument()
    // Compete is where the rack regression bit (the pre-play branch must still seed
    // the initial order).
    expect(container.querySelectorAll('[data-rack-tile]')).toHaveLength(7)
  })

  it('opens the turn viewer when a Moves row is clicked, and exits on ✕', async () => {
    const user = userEvent.setup()
    h.result = loaded(loadedGame(), [selfPlayer()], [wordPlay()])
    render(<PlayArea {...makeCtx()} />)
    // Click the turn number (#1) — clicking the WORD would define it instead.
    await user.click(screen.getByText('#1'))
    // The banner's compact label, e.g. "#1 me: +10 CAT".
    expect(screen.getByText(/me: \+10 CAT/)).toBeInTheDocument()
    await user.click(screen.getByLabelText('Exit viewing'))
    expect(screen.queryByText(/me: \+10 CAT/)).not.toBeInTheDocument()
  })

  it('renders the terminal state without crashing', () => {
    render(<PlayArea {...makeCtx({ isTerminal: true, status: { outcome: 'manual' } })} />)
    // The neutral coop terminal: "0 pts" in the action row AND the permanent
    // verdict pill below the board (both places, by rule).
    expect(screen.getAllByText('0 pts').length).toBeGreaterThan(0)
  })
})

describe('scrabble PlayArea — pass', () => {
  // Pass asks its own question, through the same modal every registry
  // question uses.
  it('asks first, and a cancel writes nothing', async () => {
    const user = userEvent.setup()
    h.result = loadedCompete()
    render(
      <>
        <PlayArea {...makeCtx({ players: twoMembers })} />
        <ConfirmationHost />
      </>,
    )
    await user.click(screen.getByRole('button', { name: 'Pass' }))
    expect(await screen.findByText('Pass your turn?')).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Keep playing' }))
    expect(rpc).not.toHaveBeenCalledWith('pass_turn', expect.anything())
  })

  it('fires pass_turn once the question is answered yes', async () => {
    const user = userEvent.setup()
    h.result = loadedCompete()
    render(
      <>
        <PlayArea {...makeCtx({ players: twoMembers })} />
        <ConfirmationHost />
      </>,
    )
    await user.click(screen.getByRole('button', { name: 'Pass' }))
    // The trigger and the modal's confirm share the name; the confirm is the
    // one the dialog adds, so it's last in the DOM.
    const confirms = await screen.findAllByRole('button', { name: 'Pass' })
    await user.click(confirms[confirms.length - 1]!)
    await waitFor(() =>
      expect(rpc).toHaveBeenCalledWith('pass_turn', expect.objectContaining({ target_game: 'g1' })),
    )
  })
})

describe('scrabble PlayArea — concede', () => {
  it('compete shows Concede and calls scrabble.concede on click', async () => {
    const user = userEvent.setup()
    h.result = loadedCompete()
    render(
      <>
        <PlayArea {...makeCtx({ players: twoMembers })} />
        <ConfirmationHost />
      </>,
    )
    // The trigger by WHICH action it is; the modal's confirm by its words,
    // which are the question's own and the subject here.
    await user.click(control('act-concede')!)
    await user.click(await screen.findByRole('button', { name: 'Concede' }))
    await waitFor(() => expect(rpc).toHaveBeenCalledWith('concede', { target_game: 'g1' }))
  })

  it('coop shows End (not Concede) and calls end_game', async () => {
    const user = userEvent.setup()
    render(
      <>
        <PlayArea {...makeCtx()} />
        <ConfirmationHost />
      </>,
    )
    expect(control('act-concede')).toBeNull()
    // The trigger by WHICH action it is; the modal's confirm shares its words
    // ("End game"), and is the one the dialog adds, so it's last in the DOM.
    await user.click(control('act-end-game')!)
    const confirms = await screen.findAllByRole('button', { name: 'End game' })
    await user.click(confirms[confirms.length - 1])
    await waitFor(() => expect(rpc).toHaveBeenCalledWith('end_game', { target_game: 'g1' }))
  })

  it('marks a conceded opponent "out" in the strip', () => {
    h.result = loadedCompete()
    render(
      <PlayArea
        {...makeCtx({ players: [gp('u1', 'me', 'red'), gp('u2', 'moth', 'blue', { conceded: true })] })}
      />,
    )
    expect(screen.getByText('out')).toBeInTheDocument()
  })

  it('shows the "You conceded" look after I concede', () => {
    h.result = loadedCompete({ currentUserId: 'u2' }) // turn already handed to u2
    render(
      <PlayArea
        {...makeCtx({ players: [gp('u1', 'me', 'red', { conceded: true }), gp('u2', 'moth', 'blue')] })}
      />,
    )
    expect(screen.getByText('You conceded')).toBeInTheDocument()
  })

  // Pins scrabble's terminal-strip verbs — the ` · `-separated format (distinct from
  // boggle/spellingbee's ` at `) that the shared `terminalOutcomeVerb` helper feeds:
  // the three outcomes must still read Won / Quit / Lost.
  it('stops claiming a turn once the game is over', () => {
    // The line's first clause IS the turn indicator in compete, so a finished
    // game went on saying "Your turn". It now names the state instead, keeping
    // the bag clause (which is still true) behind the same bullet separator.
    // Two copies: the info column's and the mobile status bar's.
    h.result = loadedCompete()
    render(<PlayArea {...makeCtx({ players: twoMembers, isTerminal: true, status: { outcome: 'compete' } })} />)
    expect(screen.queryByText(/Your turn/)).not.toBeInTheDocument()
    expect(screen.getAllByText(/Ended · 86 in bag/)).toHaveLength(2)
  })

  it('distinguishes Quit / Lost / Won at terminal in the strip', () => {
    h.result = loaded(
      loadedGame({ mode: 'compete', sharedRack: null, teamScore: null, currentUserId: 'u1' }),
      [
        selfPlayer({ score: 5, rack: RACK }), // self → Lost
        { user_id: 'u2', seat: 1, score: 12, rack: null, rack_count: 7, ai_level: null }, // → Quit
        { user_id: 'u3', seat: 2, score: 40, rack: null, rack_count: 7, ai_level: null }, // → Won
      ],
    )
    render(
      <PlayArea
        {...makeCtx({
          isTerminal: true,
          playState: 'ended',
          status: { outcome: 'compete' },
          players: [
            gp('u1', 'me', 'red', { result: { won: false } }),
            gp('u2', 'moth', 'blue', { conceded: true, result: { won: false } }),
            gp('u3', 'cade', 'green', { result: { won: true } }),
          ],
        })}
      />,
    )
    // Score first, outcome parenthesised after it. NOT `·`-joined: that is the
    // strip's PLAYER separator, so "Lost · 5 · Quit · 12" ran one glyph for two
    // jobs. The scores are asserted alongside the verbs so the pairing can't
    // silently come apart (a verb on the wrong seat would still match a bare
    // /quit/).
    expect(screen.getByText('5 (lost)')).toBeInTheDocument()
    expect(screen.getByText('12 (quit)')).toBeInTheDocument()
    expect(screen.getByText('40 (won)')).toBeInTheDocument()
  })
})

describe('scrabble PlayArea — show a move (coop)', () => {
  it('renders the Share button in coop with ≥2 players, disabled with nothing staged', () => {
    render(<PlayArea {...makeCtx({ players: twoMembers })} />)
    expect(screen.getByLabelText('Show move to team')).toBeDisabled()
  })

  it('hides the Share button in a solo coop game (no teammate to show)', () => {
    render(<PlayArea {...makeCtx()} />) // makeCtx defaults to one player
    expect(screen.queryByLabelText('Show move to team')).not.toBeInTheDocument()
  })

  it('hides the Share button in compete', () => {
    h.result = loadedCompete()
    render(<PlayArea {...makeCtx({ players: twoMembers })} />)
    expect(screen.queryByLabelText('Show move to team')).not.toBeInTheDocument()
  })

  it("opens a teammate's shared move as a read-only preview, and exits on ✕", async () => {
    const user = userEvent.setup()
    h.result = loaded(loadedGame({ version: 3 }), [selfPlayer()])
    render(<PlayArea {...makeCtx({ players: twoMembers })} />)
    // Simulate the broadcast landing (baseVersion matches our board's version).
    act(() =>
      sm.onReceive!({
        placements: [
          { x: 7, y: 7, letter: 'A', blank: false },
          { x: 8, y: 7, letter: 'B', blank: false },
        ],
        sharerId: 'u2',
        baseVersion: 3,
        words: ['AB'],
        score: 5,
      }),
    )
    // The share banner: "● moth showing: +5 AB".
    expect(screen.getByText(/moth showing: \+5 AB/)).toBeInTheDocument()
    await user.click(screen.getByLabelText('Exit viewing'))
    expect(screen.queryByText(/moth showing: \+5 AB/)).not.toBeInTheDocument()
  })

  it('ignores a stale shared move (its baseVersion no longer matches the board)', () => {
    h.result = loaded(loadedGame({ version: 5 }), [selfPlayer()])
    render(<PlayArea {...makeCtx({ players: twoMembers })} />)
    act(() =>
      sm.onReceive!({
        placements: [{ x: 7, y: 7, letter: 'A', blank: false }],
        sharerId: 'u2',
        baseVersion: 2, // a move landed since — this is stale
        words: ['A'],
        score: 1,
      }),
    )
    expect(screen.queryByText(/showing:/)).not.toBeInTheDocument()
  })
})

/**
 * The rack row's commands, read through their bindings. What matters here is
 * the REASON a control gives when it is gray: Exchange says which of its three
 * gates is shut, and the button's bubble is that sentence.
 */
describe('scrabble PlayArea — the rack row says why', () => {
  it('Exchange with a shallow bag names the bag', () => {
    h.result = loaded(loadedGame({ bagCount: 5 }), [selfPlayer()])
    render(<PlayArea {...makeCtx()} />)
    expect(describeOf('act-exchange')).toEqual({
      state: 'disabled',
      label: 'Swap',
      tooltip: 'Need ≥ 7 tiles in the bag',
    })
    expect(control('act-exchange')).toBeDisabled()
    // The reason rides the bubble; the button is still called "Swap".
    expect(control('act-exchange')?.dataset.tooltip).toBe('Need ≥ 7 tiles in the bag')
    expect(control('act-exchange')?.getAttribute('aria-label')).toBe('Swap')
  })

  it('Exchange on your turn with nothing selected asks for a selection', () => {
    render(<PlayArea {...makeCtx()} />)
    expect(describeOf('act-exchange')).toEqual({
      state: 'disabled',
      label: 'Swap',
      tooltip: 'Select rack tiles first',
    })
  })

  it('Recall is gray with nothing staged', () => {
    render(<PlayArea {...makeCtx()} />)
    expect(describeOf('act-recall-tiles')?.state).toBe('disabled')
    expect(control('act-recall-tiles')).toBeDisabled()
  })

  it('⌥Z shuffles the rack', async () => {
    render(<WithKeys {...makeCtx()} />)
    const before = Array.from(document.querySelectorAll('[data-rack-tile]')).map((t) => t.textContent)
    expect(before).toHaveLength(7)
    // The reorder is random, so the proof it ran is the randomness being drawn
    // on — a shuffled rack can land on the same order.
    const random = vi.spyOn(Math, 'random')
    await press({ key: 'Ω', code: 'KeyZ', altKey: true })
    expect(random).toHaveBeenCalled()
    random.mockRestore()
    const after = Array.from(document.querySelectorAll('[data-rack-tile]')).map((t) => t.textContent)
    expect([...after].sort()).toEqual([...before].sort())
  })

  it('Suggest a move is coop-only', () => {
    const { unmount } = render(<PlayArea {...makeCtx()} />)
    expect(describeOf('act-suggest-move')?.state).toBe('active')
    unmount()

    h.result = loadedCompete()
    render(<PlayArea {...makeCtx({ players: twoMembers })} />)
    expect(describeOf('act-suggest-move')?.state).toBe('hidden')
    expect(control('act-suggest-move')).toBeNull()
  })
})

/**
 * The commands through the dispatcher — `+`, `⌥⌫` and Restart — with the real
 * confirmation host mounted where a question is expected. A question asked
 * with no host is answered no, so the host is what lets these prove a question
 * was asked rather than skipped.
 */
describe('scrabble PlayArea — + and ⌥⌫ through the dispatcher', () => {
  it('+ at terminal deals the next game with no question', async () => {
    rpc.mockImplementation((name: string) =>
      name === 'create_game'
        ? Promise.resolve(okEnvelope({ result: 'created', id: 'next-game-id' }))
        : Promise.resolve({ error: null }),
    )
    const ctx = makeCtx({ isTerminal: true, status: { outcome: 'manual' } })
    render(<WithKeys {...ctx} />)
    await press({ key: '+' })
    // No <ConfirmationHost/> is mounted, so a question would have been answered
    // "no" — the RPC firing proves none was asked.
    await waitFor(() =>
      expect(rpc).toHaveBeenCalledWith('create_game', {
        target_club: 'testclub',
        setup: ctx.setup,
        player_user_ids: ['u1'],
        mode: 'coop',
      }),
    )
    await waitFor(() => expect(ctx.goToGame).toHaveBeenCalledWith('scrabble_coop', 'next-game-id'))
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

  it('⌥⌫ in coop asks End game’s question; yes calls end_game', async () => {
    const user = userEvent.setup()
    rpc.mockResolvedValue(okEnvelope({ result: 'ended' }))
    render(
      <>
        <WithKeys {...makeCtx()} />
        <ConfirmationHost />
      </>,
    )
    await press({ key: 'Backspace', code: 'Backspace', altKey: true })
    expect(await screen.findByText('End this game?')).toBeInTheDocument()
    // The trigger and the modal's confirm share the name; the confirm is the
    // one the dialog adds, so it's last in the DOM.
    const confirms = screen.getAllByRole('button', { name: 'End game' })
    await user.click(confirms[confirms.length - 1]!)
    await waitFor(() => expect(rpc).toHaveBeenCalledWith('end_game', { target_game: 'g1' }))
  })

  it('⌥⌫ in compete asks Concede’s question; yes calls concede', async () => {
    const user = userEvent.setup()
    rpc.mockResolvedValue(okEnvelope({ result: 'conceded' }))
    h.result = loadedCompete()
    render(
      <>
        <WithKeys {...makeCtx({ players: twoMembers })} />
        <ConfirmationHost />
      </>,
    )
    await press({ key: 'Backspace', code: 'Backspace', altKey: true })
    expect(await screen.findByText('Concede the game?')).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Concede' }))
    await waitFor(() => expect(rpc).toHaveBeenCalledWith('concede', { target_game: 'g1' }))
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

    // No host this time: the RPC firing proves no question was asked.
    const done = makeCtx({ isTerminal: true, status: { outcome: 'manual' } })
    render(<PlayArea {...done} />)
    act(() => menuItems(done).get('act-restart')!.run())
    await waitFor(() => expect(rpc).toHaveBeenCalledWith('replay_board', { target_game: 'g1' }))
  })
})
