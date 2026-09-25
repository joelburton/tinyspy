// cs-unmet

// @vitest-environment jsdom
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { GamePageCtx } from '@/common/game-page/gamePageCtx'
import { whereIStand } from '@/common/game-page/whereIStand'
import { createFeedbackSlot } from '@/common/feedback/feedbackSlotStore'
import { gp } from '@/common/members/gamePlayer.fixture'
import { boundActionFixture } from '@/common/actions/boundAction.fixture'
import { useActionDispatcher } from '@/common/actions/dispatcher'
import { ConfirmationHost } from '@/common/floating-panels/ConfirmationHost'
import { menuRow, type MenuSection } from '@/common/menu/menuModel'
import { liveBindings } from '@/common/actions/useBoundAction'
import { KeyList } from '@/common/actions/KeyList'
import type { EventRow, StrandsGame, StrandsPlayer } from '../hooks/useGame'
import { db } from '../db'
import { PlayArea } from './PlayArea'

/**
 * strands' PLAY SURFACE — the mounted tree, which is the one layer its other
 * suites can't reach.
 *
 * The rest of strands is unusually well covered *below* this: `lib/board`,
 * `lib/board.oracle` (the solver against the real archive), `lib/trace`,
 * `lib/history`, `lib/hintCopy` and the print model are pure functions with
 * their own files, and eleven pgTAP files own the rules. What none of them see
 * is the WIRING — which control renders in which state, and what each is
 * handed. That gap let a reveal bug ship on 2026-08-16: strands' coop branch
 * never writes `strands.players.solved`, so keying the auto-reveal on that bit
 * left a table that had just solved the puzzle pressing Reveal to see words
 * they'd traced themselves.
 *
 * So these are deliberately about STATE → CONTROLS, not about game logic:
 * playing vs locally-done vs terminal, the reveal's three faces, and the
 * keyboard's selection cursor.
 *
 * `useGame` (realtime + supabase) and `db` are mocked; the board, info column
 * and event log all render for real.
 */

type GameHook = ReturnType<typeof import('../hooks/useGame').useGame>

const h = vi.hoisted(() => ({ result: null as unknown as GameHook }))
vi.mock('../hooks/useGame', () => ({ useGame: () => h.result }))
vi.mock('../db', () => ({ db: { rpc: vi.fn().mockResolvedValue({ error: null }) } }))

/** An 8×6 board — the real shape, so the grid renders 48 cells like the game. */
const BOARD = ['ABCDEF', 'GHIJKL', 'MNOPQR', 'STUVWX', 'YZABCD', 'EFGHIJ', 'KLMNOP', 'QRSTUV']

const SOLUTION = {
  spangram: { word: 'SPANGRAM', coords: [[0, 0], [0, 1]] as Array<[number, number]> },
  themeWords: [
    { word: 'ALPHA', coords: [[1, 0], [1, 1]] as Array<[number, number]> },
    { word: 'BRAVO', coords: [[2, 0], [2, 1]] as Array<[number, number]> },
  ],
}

function loadedGame(over: Partial<StrandsGame> = {}): StrandsGame {
  return {
    id: 'g1',
    club_handle: 'c1',
    mode: 'coop',
    puzzle_date: '2026-06-01',
    board: BOARD,
    clue: 'Rows of nonsense',
    hint_cost: 3,
    min_word_length: 4,
    band: 5,
    // The server hands the solution over at is_terminal; whether it's DRAWN is
    // the FE's own choice, which is what most of these test.
    solution: null,
    ...over,
  }
}

function player(over: Partial<StrandsPlayer> = {}): StrandsPlayer {
  return {
    game_id: 'g1',
    user_id: 'u1',
    hints_spent: 0,
    solved: false,
    solved_at: null,
    hint_points: 0,
    active_hint_coords: null,
    ...over,
  }
}

function loaded(over: Partial<GameHook> = {}): GameHook {
  const me = over.me ?? player()
  return {
    game: loadedGame(),
    players: [me],
    me,
    events: [],
    found: [],
    loading: false,
    rowsLoaded: true,
    failure: null,
    ...over,
  }
}

/** A play surface's context. Where I stand is DERIVED from the fixture — the
 *  roster's flags, `isTerminal`, `isTurnBased` and `turnHolderId` — exactly as
 *  the page derives it (`whereIStand`), so a test sets up the facts and never
 *  hand-writes an answer the page could not give. */
function makeCtx(over: Partial<GamePageCtx> = {}): GamePageCtx {
  const facts = {
    session: { user: { id: 'u1' } } as unknown as GamePageCtx['session'],
    players: [gp('u1', 'me', 'red')],
    isTerminal: false,
    isTurnBased: false,
    turnHolderId: null,
    ...over,
  }
  return {
    gameId: 'g1',
    brand: 'PaulPath',
    title: 'Test game',
    playState: 'playing',
    timer: { displaySeconds: 0, expired: false },
    setup: { puzzle_id: 'p1', hint_cost: 3, timer: { kind: 'none' } },
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
    ...facts,
    ...whereIStand({
      players: facts.players,
      myId: facts.session.user.id,
      isTerminal: facts.isTerminal,
      isTurnBased: facts.isTurnBased,
      turnHolderId: facts.turnHolderId,
      draftsOffTurn: false,
    }),
  } as unknown as GamePageCtx
}

/** What PlayArea handed `menu.setGameSections`, as the ROWS the menu would draw
 *  — a row is a bound action now, so its words, glyph and availability come from
 *  the action rather than from the list. */
function menuItems(ctx: GamePageCtx) {
  const setSections = ctx.menu.setGameSections as unknown as ReturnType<typeof vi.fn>
  const sections = (setSections.mock.calls.at(-1)?.[0] ?? []) as MenuSection[]
  return new Map(sections.flatMap((s) => s.items).map(menuRow).map((r) => [r.id, r]))
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

/** A control by WHICH action it is, since its words vary per state. */
const control = (id: string) => document.querySelector<HTMLButtonElement>(`button[data-action="${id}"]`)

/** How many cells the live trace covers — each wears a disc on the board. */
const tracedCells = () => document.querySelectorAll('circle[class*="discTrace"]').length

/** The red rings on the cells an ambiguous letter could have meant. */
const ambiguousRings = () => document.querySelectorAll('circle[class*="ringAmbiguous"]').length

beforeEach(() => {
  h.result = loaded()
  rpc.mockReset()
  rpc.mockResolvedValue({ error: null })
})

describe('strands PlayArea — the three phases', () => {
  it('renders the 48-cell board and the clue while playing', () => {
    render(<PlayArea {...makeCtx()} />)
    expect(document.querySelectorAll('[data-cell]')).toHaveLength(48)
    // The clue is the prompt, shown from the first second — never a spoiler.
    // (Twice over: the below-board pill and the info column's own line.)
    expect(screen.getAllByText(/Rows of nonsense/).length).toBeGreaterThan(0)
    // Nothing terminal: no Reveal control at all mid-game.
    expect(control('act-reveal')).toBeNull()
  })

  it('a terminal shows the terminal row; the menu reveal wakes with it', () => {
    const live = makeCtx()
    const { unmount } = render(<PlayArea {...live} />)
    // Mid-game the menu row exists but is inert — the solution isn't even on
    // this client yet (strands._solution_for gates on is_terminal).
    expect(menuItems(live).get('act-reveal')?.disabled).toBe(true)
    unmount()

    h.result = loaded({ game: loadedGame({ solution: SOLUTION }) })
    const done = makeCtx({ isTerminal: true, playState: 'ended' })
    render(<PlayArea {...done} />)
    expect(menuItems(done).get('act-reveal')?.disabled).toBe(false)
    expect(control('act-reveal')).toBeEnabled()
  })

  it('compete: a solved player waits with the terminal LOOK while the race runs', () => {
    // strands deliberately doesn't end on first solve — the winner is whoever
    // solved on the fewest hints — so a solver goes LOCALLY terminal.
    const me = player({ solved: true })
    h.result = loaded({ game: loadedGame({ mode: 'compete' }), me, players: [me] })
    const solver = gp('u1', 'me', 'red', { locally_terminal: true })
    render(<PlayArea {...makeCtx({ players: [solver], isTerminal: false, playState: 'playing' })} />)
    expect(screen.getByText('You solved it — waiting')).toBeInTheDocument()
    // …and cannot pull the answer while a rival is still tracing.
    expect(screen.queryByText('Words:')).not.toBeInTheDocument()
  })

  it('compete: a racer who is out still has the one flag — End for all', () => {
    // Conceding is closed to a player already out; ending the game for all is
    // open to anyone in it, so the row's flag is End.
    const me = player({ solved: true })
    h.result = loaded({ game: loadedGame({ mode: 'compete' }), me, players: [me] })
    const solver = gp('u1', 'me', 'red', { locally_terminal: true })
    render(<PlayArea {...makeCtx({ players: [solver], isTerminal: false, playState: 'playing' })} />)
    expect(control('act-concede')).toBeNull()
    expect(control('act-end-game')).not.toBeNull()
  })
})

/**
 * The reveal's three faces, and the state that picks each one. The words line
 * is the half a consumed board can't give you: strands draws PATHS and never
 * spells anything out.
 */
describe('strands PlayArea — the terminal reveal', () => {
  const finished = (over: Partial<GameHook> = {}) => {
    h.result = loaded({ game: loadedGame({ solution: SOLUTION }), ...over })
  }

  it('a terminal nobody solved keeps the words hidden until asked', async () => {
    const user = userEvent.setup()
    finished()
    render(<PlayArea {...makeCtx({ isTerminal: true, playState: 'ended' })} />)
    expect(screen.queryByText('Words:')).not.toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: 'Reveal solution' }))
    // Spangram FIRST — it's the word that names the theme.
    const line = screen.getByText('Words:').closest('p')!
    expect(line.textContent).toMatch(/Words:\s*SPANGRAM\s*ALPHA\s*BRAVO/)

    // …and the same button takes it back off.
    await user.click(screen.getByRole('button', { name: 'Hide solution' }))
    expect(screen.queryByText('Words:')).not.toBeInTheDocument()
  })

  /**
   * The 2026-08-16 bug, in the game where it bit hardest. strands' coop branch
   * ends the game directly and never writes `strands.players.solved` — so a
   * per-player predicate reads FALSE for the very table that just solved it.
   * `solvedByMe` asks the GAME in coop for exactly this reason.
   */
  it('a COOP WIN names the words unasked, and the control says it is done', () => {
    finished({ me: player({ solved: false }) }) // ← coop never sets it
    render(<PlayArea {...makeCtx({ isTerminal: true, playState: 'won' })} />)
    expect(screen.getByText('Words:')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Solution already shown' })).toBeDisabled()
  })

  it('compete: the RACE being won is not my solve', () => {
    // `won_compete` means SOMEONE won. A player who never solved must still ask.
    const me = player({ solved: false })
    finished({ game: loadedGame({ mode: 'compete', solution: SOLUTION }), me, players: [me] })
    render(<PlayArea {...makeCtx({ isTerminal: true, playState: 'won_compete' })} />)
    expect(screen.queryByText('Words:')).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Reveal solution' })).toBeEnabled()
  })

  it('compete: solving but LOSING on hints still counts as my solve', () => {
    // The race doesn't end on first solve, so the player who solved and was
    // out-hinted still consumed their board — they're looking at the answer.
    const me = player({ solved: true, hints_spent: 3 })
    finished({ game: loadedGame({ mode: 'compete', solution: SOLUTION }), me, players: [me] })
    render(<PlayArea {...makeCtx({ isTerminal: true, playState: 'won_compete' })} />)
    expect(screen.getByText('Words:')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Solution already shown' })).toBeDisabled()
  })

  it('the menu twin tracks the button through all three faces', async () => {
    const ctx = makeCtx({ isTerminal: true, playState: 'ended' })
    finished()
    render(<PlayArea {...ctx} />)
    expect(menuItems(ctx).get('act-reveal')?.label).toBe('Reveal solution')

    act(() => menuItems(ctx).get('act-reveal')!.run())
    await waitFor(() => expect(menuItems(ctx).get('act-reveal')?.label).toBe('Hide solution'))
  })
})

describe('strands PlayArea — the Hint button says where the economy stands', () => {
  // The words never move — the bar's one control must not resize as points
  // come in — so the state of the economy rides in the bubble.
  const hintButton = () => screen.getByRole('button', { name: 'Hint' })

  it('unearned: live, and the bubble counts the words still to find', () => {
    h.result = loaded({ me: player({ hint_points: 1 }) })
    render(<PlayArea {...makeCtx()} />)
    expect(hintButton().hasAttribute('disabled')).toBe(false)
    expect(hintButton().dataset.tooltip).toBe('Find 2 more valid words')
  })

  it('earned: the bubble says what cashing it does', () => {
    h.result = loaded({ me: player({ hint_points: 3 }) })
    render(<PlayArea {...makeCtx()} />)
    expect(hintButton().dataset.tooltip).toBe('Reveal the tiles of one theme word')
  })

  it('a hint already on the board: gray, and the bubble says so', () => {
    h.result = loaded({ me: player({ hint_points: 0, active_hint_coords: [[1, 0]] }) })
    render(<PlayArea {...makeCtx()} />)
    expect(hintButton().hasAttribute('disabled')).toBe(true)
    expect(hintButton().dataset.tooltip).toBe('A hint is already showing')
  })
})

/**
 * The board's letter key, through the dispatcher. A typed letter extends the
 * trace when exactly one cell that could come next bears it — and the key
 * stands down while a past turn is open, because that press is the viewer's.
 */
describe('strands PlayArea — a letter extends the trace', () => {
  it('a letter that names one cell extends the trace; its neighbor extends it again', async () => {
    render(<WithKeys {...makeCtx()} />)
    expect(tracedCells()).toBe(0)
    // W sits once on the board (row 3, col 4), so the first letter is not a
    // choice among 48 cells.
    await press({ key: 'w' })
    expect(tracedCells()).toBe(1)
    // X is its right-hand neighbor and appears nowhere else.
    await press({ key: 'x' })
    expect(tracedCells()).toBe(2)
    // ⌫ takes the last one back.
    await press({ key: 'Backspace', code: 'Backspace' })
    expect(tracedCells()).toBe(1)
  })

  // The board's answer to "several cells bear that letter": red rings on the
  // candidates, and no pill — the rings ARE the message, so if they stop being
  // drawn the player is told nothing at all.
  it('rings every candidate when a letter is ambiguous, and drops them on the next resolving key', async () => {
    render(<WithKeys {...makeCtx()} />)
    // A sits at (0,0) and (4,2) on this board, so it names no single cell.
    await press({ key: 'a' })
    expect(ambiguousRings()).toBe(2)
    expect(tracedCells()).toBe(0) // …and nothing was traced

    // W names one cell, so it resolves — and the rings from the last key stop
    // pointing at a choice that has been made.
    await press({ key: 'w' })
    expect(ambiguousRings()).toBe(0)
    expect(tracedCells()).toBe(1)
  })

  it('is gray while a past turn is open — the press belongs to the viewer', async () => {
    const user = userEvent.setup()
    const turn: EventRow = {
      kind: 'guess', id: 1, game_id: 'g1', user_id: 'u1', word: 'ALPHA',
      path: [[1, 0], [1, 1]], result: 'theme', created_at: '2026-06-01T00:00:00Z',
    }
    h.result = loaded({ events: [turn], found: [] })
    render(<WithKeys {...makeCtx()} />)
    expect(stateOf('act-extend-trace')).toBe('active')

    // The "#N" handle, by its text rather than a tooltip's wording.
    await user.click(screen.getByText(/^#\d+$/))
    expect(stateOf('act-extend-trace')).toBe('disabled')
    await press({ key: 'w' })
    expect(tracedCells()).toBe(0)
  })
})

/**
 * The commands through the dispatcher — `+`, `⌥⌫` and Restart — with the real
 * confirmation host mounted where a question is expected. A question asked
 * with no host is answered no, so the host is what lets these prove a question
 * was asked rather than skipped.
 */
describe('strands PlayArea — + and ⌥⌫ through the dispatcher', () => {
  /** New game is the NEXT puzzle: a preview read, then the create. */
  const nextPuzzleThenCreate = () =>
    rpc.mockImplementation((name: string) => {
      if (name === 'next_puzzle_for_club') return Promise.resolve(okEnvelope({ result: 'found', puzzle_id: 'p2' }))
      if (name === 'create_game') return Promise.resolve(okEnvelope({ result: 'created', id: 'next-game-id' }))
      return Promise.resolve({ error: null })
    })

  it('+ at terminal starts the next puzzle with no question', async () => {
    nextPuzzleThenCreate()
    h.result = loaded({ game: loadedGame({ solution: SOLUTION }) })
    const ctx = makeCtx({ isTerminal: true, playState: 'ended' })
    render(<WithKeys {...ctx} />)
    await press({ key: '+' })
    // No <ConfirmationHost/> is mounted, so a question would have been answered
    // "no" — the RPC firing proves none was asked. `puzzle_id` is deliberately
    // absent: the server picks.
    await waitFor(() =>
      expect(rpc).toHaveBeenCalledWith('create_game', {
        target_club: 'testclub',
        setup: { hint_cost: 3, timer: { kind: 'none' } },
        player_user_ids: ['u1'],
        mode: 'coop',
      }),
    )
    await waitFor(() => expect(ctx.goToGame).toHaveBeenCalledWith('strands_coop', 'next-game-id'))
  })

  it('+ mid-game asks first, and cancel starts nothing', async () => {
    const user = userEvent.setup()
    nextPuzzleThenCreate()
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
    const me = player()
    h.result = loaded({ game: loadedGame({ mode: 'compete' }), me, players: [me, player({ user_id: 'u2' })] })
    render(
      <>
        <WithKeys {...makeCtx({ players: [gp('u1', 'me', 'red'), gp('u2', 'moth', 'blue')] })} />
        <ConfirmationHost />
      </>,
    )
    await press({ key: 'Backspace', code: 'Backspace', altKey: true })
    expect(await screen.findByText('Concede, or end the game?')).toBeInTheDocument()
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
    h.result = loaded({ game: loadedGame({ solution: SOLUTION }) })
    const done = makeCtx({ isTerminal: true, playState: 'ended' })
    render(<PlayArea {...done} />)
    act(() => menuItems(done).get('act-restart')!.run())
    await waitFor(() => expect(rpc).toHaveBeenCalledWith('replay_board', { target_game: 'g1' }))
  })
})

describe('strands PlayArea — before the game has loaded', () => {
  // A binding joins the stack on the FIRST render, before the loading guard
  // has anything to show, and its `describe` can be read right then: the key
  // list asks every live binding when Help opens, and the dispatcher asks ⌫
  // and Enter's on any press. So nothing a `describe` names may be derived
  // below the guards — `isLocallyDone` and `waiting` once were, and a keypress
  // on a loading page threw.
  it('every binding can describe itself while the page is still loading', () => {
    h.result = loaded({ loading: true, game: null, me: null })
    render(
      <>
        <PlayArea {...makeCtx()} />
        <KeyList />
      </>,
    )
    expect(screen.getByText('Loading…')).toBeInTheDocument()
    for (const binding of liveBindings()) expect(() => binding.describe('button')).not.toThrow()
  })
})

/**
 * The keyboard's selection cursor. Cells are `row,col`; the board's rows are
 * `ABCDEF`, `GHIJKL`, … so `A` sits at 0,0 and again at 4,2. Arrows move the
 * ring, Space is a CLICK on the ringed letter, and a typed letter or a
 * submitted word moves the cursor to the trace's end and hides it.
 */
describe('strands PlayArea — the selection cursor', () => {
  beforeEach(() => {
    h.result = loaded()
    rpc.mockReset()
    rpc.mockResolvedValue(okEnvelope({
      result: 'invalid', word: 'AB', hint_points: 0, hint_cost: 3, words_found: 0, terminal: false,
    }))
  })

  /** Where the ring is DRAWN, as `row,col`, or null when it isn't — read off
   *  the circle's center, which sits at (col + 0.5, row + 0.5) in cell units. */
  const ringAt = () => {
    const ring = document.querySelector('circle[class*="ringCursor"]')
    if (!ring) return null
    return `${Number(ring.getAttribute('cy')) - 0.5},${Number(ring.getAttribute('cx')) - 0.5}`
  }
  /** The traced cells, in board order. */
  const traced = () =>
    [...document.querySelectorAll('[data-cell]')]
      .filter((b) => /tileTrace/.test(b.className))
      .map((b) => b.getAttribute('data-cell'))
  /** Where the trace ends. */
  const traceEnd = () =>
    [...document.querySelectorAll('[data-cell]')].find((b) => /tileLast/.test(b.className))?.getAttribute('data-cell') ?? null
  const key = (k: string) => press({ key: k })
  const keys = async (...ks: string[]) => {
    for (const k of ks) await key(k)
  }

  it('is hidden until an arrow; the first arrow rings the first letter, the next moves it', async () => {
    render(<WithKeys {...makeCtx()} />)
    expect(ringAt()).toBeNull()

    await key('ArrowRight')
    expect(ringAt()).toBe('0,0')
    await key('ArrowRight')
    expect(ringAt()).toBe('0,1')
    await key('ArrowDown')
    expect(ringAt()).toBe('1,1')
  })

  // Space is exactly a click: extend a neighbor, back up to before a letter
  // already traced, start over from a far one.
  it('Space does nothing while hidden, then does what a click does', async () => {
    render(<WithKeys {...makeCtx()} />)
    await key(' ')
    expect(traced()).toEqual([])

    await keys('ArrowRight', ' ', 'ArrowRight', ' ')
    expect(traced()).toEqual(['0,0', '0,1'])

    // The last letter again: back up to just before it.
    await key(' ')
    expect(traced()).toEqual(['0,0'])

    // A far letter: start over there.
    await keys('ArrowDown', 'ArrowDown', 'ArrowDown', ' ')
    expect(traced()).toEqual(['3,1'])
  })

  it('arrowing moves the ring and never the trace’s end', async () => {
    render(<WithKeys {...makeCtx()} />)
    await keys('ArrowRight', ' ', 'ArrowRight', ' ')
    expect(traceEnd()).toBe('0,1')
    await keys('ArrowDown', 'ArrowRight', 'ArrowDown')
    expect(ringAt()).toBe('2,2')
    expect(traceEnd()).toBe('0,1')
  })

  it('a typed letter moves the cursor onto it and hides it; the next arrow shows it there', async () => {
    render(<WithKeys {...makeCtx()} />)
    await keys('ArrowRight', ' ')
    // From A at 0,0 the only neighboring H is 1,1.
    await key('h')
    expect(traced()).toEqual(['0,0', '1,1'])
    expect(ringAt()).toBeNull()

    await key('ArrowRight')
    expect(ringAt()).toBe('1,1')
  })

  // A typed letter that several cells could be rings them red and waits; the
  // arrows reach one and Space takes it, with no mouse.
  it('arrows reach a red-ringed candidate and Space takes it', async () => {
    render(<WithKeys {...makeCtx()} />)
    await key('a')
    expect(traced()).toEqual([])

    await keys('ArrowDown', 'ArrowDown', 'ArrowDown', 'ArrowDown', 'ArrowDown', 'ArrowRight', 'ArrowRight')
    expect(ringAt()).toBe('4,2')
    await key(' ')
    expect(traced()).toEqual(['4,2'])
  })

  it('a click moves the cursor onto the letter and hides it', async () => {
    const user = userEvent.setup()
    render(<WithKeys {...makeCtx()} />)
    await key('ArrowRight')
    await user.click(document.querySelector('[data-cell="2,3"]')!)
    expect(traced()).toEqual(['2,3'])
    expect(ringAt()).toBeNull()

    await key('ArrowLeft')
    expect(ringAt()).toBe('2,3')
  })

  it('a submitted word moves the cursor to its last letter and hides it', async () => {
    render(<WithKeys {...makeCtx()} />)
    await keys('ArrowRight', ' ', 'ArrowRight', ' ', 'ArrowDown', 'ArrowDown')
    expect(ringAt()).toBe('2,1')

    await key('Enter')
    await waitFor(() => expect(rpc).toHaveBeenCalledWith('submit_path', expect.objectContaining({ path: [[0, 0], [0, 1]] })))
    expect(ringAt()).toBeNull()

    await key('ArrowRight')
    expect(ringAt()).toBe('0,1')
  })

  it('a board I cannot play takes no ring and no keys', async () => {
    // A teammate holds the move.
    render(
      <WithKeys
        {...makeCtx({
          players: [gp('u1', 'me', 'red'), gp('u2', 'moth', 'blue')],
          isTurnBased: true,
          turnHolderId: 'u2',
        })}
      />,
    )
    await keys('ArrowRight', ' ')
    expect(ringAt()).toBeNull()
    expect(traced()).toEqual([])
  })
})
