// @vitest-environment jsdom
import { act, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { GamePageCtx } from '../../common/lib/games'
import { gp } from '../../common/test/gamePlayers'
import type { EventRow, StrandsGame, StrandsPlayer } from '../hooks/useGame'
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
 * playing vs locally-done vs terminal, and the reveal's three faces.
 *
 * `useGame` (realtime + supabase) and `db` are mocked; the board, info column
 * and turn log all render for real.
 */

type GameHook = {
  game: StrandsGame | null
  players: StrandsPlayer[]
  me: StrandsPlayer | null
  events: EventRow[]
  found: EventRow[]
  loading: boolean
  rowsLoaded: boolean
}

const h = vi.hoisted(() => ({ result: null as unknown as GameHook }))
vi.mock('../hooks/useGame', () => ({ useGame: () => h.result }))
vi.mock('../db', () => ({ db: { rpc: vi.fn().mockResolvedValue({ error: null }) } }))
vi.mock('../../common/lib/game/manifestRpcs', () => ({ invokeStartGameEdgeFn: vi.fn() }))

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
    ...over,
  }
}

function makeCtx(over: Partial<GamePageCtx> = {}): GamePageCtx {
  return {
    session: { user: { id: 'u1' } } as unknown as GamePageCtx['session'],
    gameId: 'g1',
    brand: 'PaulPath',
    title: 'Test game',
    players: [gp('u1', 'me', 'red')],
    playState: 'playing',
    isTerminal: false,
    timer: { displaySeconds: 0, expired: false },
    isMyTurn: true,
    currentTurnUserId: null,
    setup: { puzzleId: 'p1', hint_cost: 3, timer: { kind: 'none' } },
    status: null,
    globalFeedback: { show: vi.fn(), clear: vi.fn() },
    goToClub: vi.fn(),
    clubHandle: 'testclub',
    goToGame: vi.fn(),
    menu: { setGameSections: vi.fn(), openHelp: vi.fn(), requestBackToClub: vi.fn() },
    ...over,
  } as unknown as GamePageCtx
}

/** Flatten what PlayArea handed `menu.setGameSections` into id → item. */
function menuItems(ctx: GamePageCtx) {
  const setSections = ctx.menu.setGameSections as unknown as ReturnType<typeof vi.fn>
  const sections = setSections.mock.calls.at(-1)?.[0] ?? []
  return new Map(
    (sections as { items: { id: string; label: string; disabled?: boolean; onClick: () => void }[] }[])
      .flatMap((s) => s.items)
      .map((i) => [i.id, i]),
  )
}

beforeEach(() => {
  h.result = loaded()
})

describe('strands PlayArea — the three phases', () => {
  it('renders the 48-cell board and the clue while playing', () => {
    render(<PlayArea {...makeCtx()} />)
    expect(document.querySelectorAll('[data-cell]')).toHaveLength(48)
    // The clue is the prompt, shown from the first second — never a spoiler.
    // (Twice over: the below-board pill and the info column's own line.)
    expect(screen.getAllByText(/Rows of nonsense/).length).toBeGreaterThan(0)
    // Nothing terminal: no Reveal control at all mid-game.
    expect(screen.queryByRole('button', { name: /reveal|hide|already shown/i })).toBeNull()
  })

  it('a terminal shows the terminal row; the menu reveal wakes with it', () => {
    const live = makeCtx()
    const { unmount } = render(<PlayArea {...live} />)
    // Mid-game the menu row exists but is inert — the solution isn't even on
    // this client yet (strands._solution_for gates on is_terminal).
    expect(menuItems(live).get('reveal')?.disabled).toBe(true)
    unmount()

    h.result = loaded({ game: loadedGame({ solution: SOLUTION }) })
    const done = makeCtx({ isTerminal: true, playState: 'ended' })
    render(<PlayArea {...done} />)
    expect(menuItems(done).get('reveal')?.disabled).toBe(false)
    expect(screen.getByRole('button', { name: 'Reveal answer' })).toBeEnabled()
  })

  it('compete: a solved player waits with the terminal LOOK while the race runs', () => {
    // strands deliberately doesn't end on first solve — the winner is whoever
    // solved on the fewest hints — so a solver goes LOCALLY terminal.
    const me = player({ solved: true })
    h.result = loaded({ game: loadedGame({ mode: 'compete' }), me, players: [me] })
    render(<PlayArea {...makeCtx({ isTerminal: false, playState: 'playing' })} />)
    expect(screen.getByText('You solved it — waiting')).toBeInTheDocument()
    // …and cannot pull the answer while a rival is still tracing.
    expect(screen.queryByText('Words:')).not.toBeInTheDocument()
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

    await user.click(screen.getByRole('button', { name: 'Reveal answer' }))
    // Spangram FIRST — it's the word that names the theme.
    const line = screen.getByText('Words:').closest('p')!
    expect(line.textContent).toMatch(/Words:\s*SPANGRAM\s*ALPHA\s*BRAVO/)

    // …and the same button takes it back off.
    await user.click(screen.getByRole('button', { name: 'Hide answer' }))
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
    expect(screen.getByRole('button', { name: 'Reveal answer' })).toBeEnabled()
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
    expect(menuItems(ctx).get('reveal')?.label).toBe('Reveal answer')

    act(() => menuItems(ctx).get('reveal')!.onClick())
    await waitFor(() => expect(menuItems(ctx).get('reveal')?.label).toBe('Hide answer'))
  })
})
