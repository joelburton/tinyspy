/**
 * Render + concede tests for connections' PlayArea.
 *
 * `useGame` (realtime + supabase) and `db` are mocked so no client/network is
 * needed; everything else — the board, strip, turn log, action row — renders
 * for real. These are deliberately shallow: game logic lives in pgTAP (the RPCs)
 * and `evaluate.test.ts` (the guess evaluator); here we prove the component tree
 * mounts and that the concede wiring (compete → connections.concede; coop → End)
 * is correct.
 */
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { GamePageCtx } from '../../common/lib/games'
import { gp } from '../../common/test/gamePlayers'
import type {
  ConnectionsGame,
  GuessRow,
  MatchedCategory,
} from '../hooks/useGame'
import { db } from '../db'
import { PlayArea } from './PlayArea'

// The shape connections' useGame returns — the mock hands one of these back.
type GameHook = {
  game: ConnectionsGame | null
  guesses: GuessRow[]
  matchedCategories: MatchedCategory[]
  mistakeCount: number
  opponentFound: ReadonlyMap<string, number>
  isEliminated: boolean
  selections: ReadonlyMap<string, string[]>
  unionTiles: string[]
  toggleTile: (tile: string) => void
  sendClear: () => void
  loading: boolean
}

// A mutable holder the mocked useGame returns each render — set per test before
// render(). `vi.hoisted` runs before the (also-hoisted) `vi.mock` factory, so
// the factory can close over it safely.
const h = vi.hoisted(() => ({ result: null as unknown as GameHook }))
vi.mock('../hooks/useGame', () => ({ useGame: () => h.result }))
vi.mock('../db', () => ({ db: { rpc: vi.fn() } }))

const rpc = db.rpc as unknown as ReturnType<typeof vi.fn>

/** A minimal 4-category / 16-tile board — enough for the FE to render the grid
 *  and the info-column setup disclosure without crashing. */
const board: ConnectionsGame['board'] = {
  categories: [
    { rank: 0, name: 'RED', tiles: ['a', 'b', 'c', 'd'] },
    { rank: 1, name: 'GREEN', tiles: ['e', 'f', 'g', 'h'] },
    { rank: 2, name: 'BLUE', tiles: ['i', 'j', 'k', 'l'] },
    { rank: 3, name: 'PURPLE', tiles: ['m', 'n', 'o', 'p'] },
  ],
  tileOrder: ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h', 'i', 'j', 'k', 'l', 'm', 'n', 'o', 'p'],
}

function game(mode: 'coop' | 'compete'): ConnectionsGame {
  return {
    id: 'g1',
    club_handle: 'club',
    mode,
    board,
    puzzleDate: '2026-06-15',
    created_at: '2026-06-15T00:00:00Z',
  }
}

/** A loaded hook result; override mode + per-player state per test. */
function loaded(over: Partial<GameHook> = {}): GameHook {
  return {
    game: game('compete'),
    guesses: [],
    matchedCategories: [],
    mistakeCount: 0,
    opponentFound: new Map(),
    isEliminated: false,
    selections: new Map(),
    unionTiles: [],
    toggleTile: vi.fn(),
    sendClear: vi.fn(),
    loading: false,
    ...over,
  }
}

function makeCtx(over: Partial<GamePageCtx> = {}): GamePageCtx {
  return {
    session: { user: { id: 'u1' } } as unknown as GamePageCtx['session'],
    gameId: 'g1',
    brand: 'WordKnit',
    title: 'Test game',
    players: [gp('u1', 'me', 'red')],
    playState: 'playing',
    isTerminal: false,
    timer: { displaySeconds: 0, expired: false },
    setup: { puzzleId: 'p1', timer: { kind: 'none' } },
    status: null,
    globalFeedback: { show: vi.fn(), clear: vi.fn() },
    goToClub: vi.fn(),
    clubHandle: 'testclub',
    goToGame: vi.fn(),
    menu: { setGameSections: vi.fn(), openHelp: vi.fn(), requestBackToClub: vi.fn() },
    ...over,
  }
}

const twoMembers = [gp('u1', 'me', 'red'), gp('u2', 'moth', 'blue')]

beforeEach(() => {
  h.result = loaded()
  rpc.mockReset()
  rpc.mockResolvedValue({ error: null })
})

describe('connections PlayArea — concede', () => {
  it('compete shows Concede and calls connections.concede on click', async () => {
    vi.spyOn(window, 'confirm').mockReturnValue(true)
    const user = userEvent.setup()
    h.result = loaded({ game: game('compete') })
    render(<PlayArea {...makeCtx({ players: twoMembers })} />)
    await user.click(screen.getByRole('button', { name: /concede/i }))
    expect(rpc).toHaveBeenCalledWith('concede', { target_game: 'g1' })
  })

  it('coop shows End (not Concede) and calls end_game', async () => {
    vi.spyOn(window, 'confirm').mockReturnValue(true)
    const user = userEvent.setup()
    h.result = loaded({ game: game('coop') })
    render(<PlayArea {...makeCtx()} />)
    expect(screen.queryByRole('button', { name: /concede/i })).not.toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: /^end$/i }))
    expect(rpc).toHaveBeenCalledWith('end_game', { target_game: 'g1' })
  })

  it('marks a conceded opponent "out" in the strip', () => {
    h.result = loaded({ game: game('compete') })
    render(
      <PlayArea
        {...makeCtx({
          players: [gp('u1', 'me', 'red'), gp('u2', 'moth', 'blue', { conceded: true })],
        })}
      />,
    )
    expect(screen.getByText('out')).toBeInTheDocument()
  })

  it('shows the "You conceded" locally-terminal look after I concede', () => {
    h.result = loaded({ game: game('compete') })
    render(
      <PlayArea
        {...makeCtx({
          players: [gp('u1', 'me', 'red', { conceded: true }), gp('u2', 'moth', 'blue')],
        })}
      />,
    )
    // The info-column action row shows the bold status; the below-board pill
    // carries the fuller "You conceded — the rest are still racing." sentence.
    expect(screen.getByText('You conceded')).toBeInTheDocument()
  })
})
