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
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { GamePageCtx } from '../../common/lib/games'
import { gp } from '../../common/test/gamePlayers'
import type { PlayRow, PlayerRow, ScrabbleGame } from '../hooks/useGame'
import { db } from '../db'
import { PlayArea } from './PlayArea'

const rpc = db.rpc as unknown as ReturnType<typeof vi.fn>

type GameHook = {
  game: ScrabbleGame | null
  players: PlayerRow[]
  plays: PlayRow[]
  loading: boolean
}

// A mutable holder the mocked useGame returns each render — set per test before
// render(). `vi.hoisted` runs before the (also-hoisted) `vi.mock` factory.
const h = vi.hoisted(() => ({ result: null as unknown as GameHook }))
vi.mock('../hooks/useGame', () => ({ useGame: () => h.result }))
vi.mock('../db', () => ({ db: { rpc: vi.fn() } }))

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
    currentUserId: null,
    ...over,
  }
}

function selfPlayer(over: Partial<PlayerRow> = {}): PlayerRow {
  return { user_id: 'u1', seat: 0, score: null, rack: null, rack_count: 7, ...over }
}

function loaded(game: ScrabbleGame, players: PlayerRow[], plays: PlayRow[] = []): GameHook {
  return { game, players, plays, loading: false }
}

/** A committed word play, for the move log / turn viewer. */
function wordPlay(over: Partial<PlayRow> = {}): PlayRow {
  return {
    user_id: 'u1',
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
    players: [gp('u1', 'me', 'red')],
    playState: 'playing',
    isTerminal: false,
    timer: { displaySeconds: 0, expired: false },
    setup: { dict_2: 3, dict_3plus: 3, timer: { kind: 'none' } },
    status: null,
    globalFeedback: { show: vi.fn(), clear: vi.fn() },
    goToClub: vi.fn(),
    menu: { setGameItems: vi.fn() },
    ...over,
  } as unknown as GamePageCtx
}

beforeEach(() => {
  h.result = loaded(loadedGame(), [selfPlayer()])
  rpc.mockReset()
  rpc.mockResolvedValue({ error: null })
})

/** A loaded compete game with two seated players (u1 + u2). */
function loadedCompete(over: Partial<ScrabbleGame> = {}) {
  return loaded(
    loadedGame({ mode: 'compete', sharedRack: null, teamScore: null, currentUserId: 'u1', ...over }),
    [selfPlayer({ score: 0, rack: RACK }), { user_id: 'u2', seat: 1, score: 0, rack: null, rack_count: 7 }],
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
    // The info-column state line (coop): "Team score: 0 · 86 in bag".
    expect(screen.getByText(/in bag/)).toBeInTheDocument()
    expect(screen.getByText(/Team score:/)).toBeInTheDocument()
  })

  it('renders the OpponentStrip (Score) + rack in compete play', () => {
    h.result = loaded(
      loadedGame({ mode: 'compete', sharedRack: null, teamScore: null, currentUserId: 'u1' }),
      [selfPlayer({ score: 0, rack: RACK }), { user_id: 'u2', seat: 1, score: 0, rack: null, rack_count: 7 }],
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

describe('scrabble PlayArea — concede', () => {
  it('compete shows Concede and calls scrabble.concede on click', async () => {
    vi.spyOn(window, 'confirm').mockReturnValue(true)
    const user = userEvent.setup()
    h.result = loadedCompete()
    render(<PlayArea {...makeCtx({ players: twoMembers })} />)
    await user.click(screen.getByRole('button', { name: /concede/i }))
    expect(rpc).toHaveBeenCalledWith('concede', { target_game: 'g1' })
  })

  it('coop shows End (not Concede) and calls end_game', async () => {
    vi.spyOn(window, 'confirm').mockReturnValue(true)
    const user = userEvent.setup()
    render(<PlayArea {...makeCtx()} />)
    expect(screen.queryByRole('button', { name: /concede/i })).not.toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: /^end$/i }))
    expect(rpc).toHaveBeenCalledWith('end_game', { target_game: 'g1' })
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
})
