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
import { render, screen, waitFor } from '@testing-library/react'
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
    isMyTurn: true,
    currentTurnUserId: null,
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
    const user = userEvent.setup()
    h.result = loaded({ game: game('coop') })
    render(<PlayArea {...makeCtx()} />)
    expect(screen.queryByRole('button', { name: /concede/i })).not.toBeInTheDocument()
    // The trigger and the modal's confirm now share the name "End game" (the
    // button label went from "End" to the full phrase, since icon-only buttons
    // make the label the accessible name). The confirm is the one the dialog
    // adds, so it's last in the DOM.
    await user.click(screen.getByRole('button', { name: 'End game' }))
    const confirms = await screen.findAllByRole('button', { name: 'End game' })
    await user.click(confirms[confirms.length - 1])
    await waitFor(() => expect(rpc).toHaveBeenCalledWith('end_game', { target_game: 'g1' }))
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
    // carries the shared "Conceded — race continues" variant.
    expect(screen.getByText('You conceded')).toBeInTheDocument()
  })
})

/**
 * The ended board, and the terminal reveal.
 *
 * connections used to be one of the two games that opened its answer unasked —
 * and the way it did it was destructive: the board swaps loose tiles for
 * full-width category bands, so revealing DELETED the tiles the players were
 * still staring at. A lost game showed four bands and nothing else, with no
 * record of how far anyone had got.
 *
 * Now the ended board is what they actually left (their bands plus the tiles
 * they never cracked, frozen), Reveal swaps in the unsolved categories, and
 * Hide swaps back.
 */
describe('connections PlayArea — the ended board + the terminal reveal', () => {
  /** The loose tiles currently on the board (bands are divs; the floating
   *  Shuffle control is a button inside the board root, hence `[data-tile]`). */
  const tileNames = () => [...document.querySelectorAll('[data-tile]')].map((b) => b.textContent)

  it('keeps the unsolved tiles on a lost board — the record of how far you got', () => {
    h.result = loaded({
      game: game('coop'),
      matchedCategories: [{ rank: 0, name: 'RED', tiles: ['a', 'b', 'c', 'd'], matched_at: '2026-06-15T00:00:00Z' }],
      mistakeCount: 4,
    })
    render(<PlayArea {...makeCtx({ isTerminal: true, playState: 'lost' })} />)

    // The one they solved is a band; the other twelve tiles are still there.
    expect(screen.getByText('RED')).toBeInTheDocument()
    expect(tileNames()).toHaveLength(12)
    // And the answer is NOT on screen until asked for.
    expect(screen.queryByText('PURPLE')).not.toBeInTheDocument()
  })

  it('Reveal swaps the tiles for the unsolved categories; Hide swaps back', async () => {
    const user = userEvent.setup()
    h.result = loaded({
      game: game('coop'),
      matchedCategories: [{ rank: 0, name: 'RED', tiles: ['a', 'b', 'c', 'd'], matched_at: '2026-06-15T00:00:00Z' }],
      mistakeCount: 4,
    })
    render(<PlayArea {...makeCtx({ isTerminal: true, playState: 'lost' })} />)

    await user.click(screen.getByRole('button', { name: 'Reveal categories' }))
    expect(screen.getByText('GREEN')).toBeInTheDocument()
    expect(screen.getByText('PURPLE')).toBeInTheDocument()
    expect(tileNames()).toHaveLength(0)
    // Local state — no peer's board changed.
    expect(rpc).not.toHaveBeenCalled()

    await user.click(screen.getByRole('button', { name: 'Hide categories' }))
    expect(screen.queryByText('PURPLE')).not.toBeInTheDocument()
    expect(tileNames()).toHaveLength(12)
  })

  it('an eliminated compete player sees no answer while the others race', () => {
    h.result = loaded({ game: game('compete'), isEliminated: true, mistakeCount: 4 })
    render(<PlayArea {...makeCtx({ isTerminal: false, playState: 'playing' })} />)

    // Their board freezes and says so, but the puzzle stays unspoiled — sitting
    // out with something left to think about beats being handed the answer.
    expect(screen.getByText('You’re out')).toBeInTheDocument()
    expect(screen.queryByText('PURPLE')).not.toBeInTheDocument()
    expect(tileNames()).toHaveLength(16)
    // No Reveal either: it waits for the game to end for everyone.
    expect(screen.queryByRole('button', { name: 'Reveal categories' })).not.toBeInTheDocument()
  })

  it('a frozen board ignores tile clicks', async () => {
    const user = userEvent.setup()
    const toggleTile = vi.fn()
    h.result = loaded({ game: game('coop'), mistakeCount: 4, toggleTile })
    render(<PlayArea {...makeCtx({ isTerminal: true, playState: 'lost' })} />)

    await user.click(document.querySelector('[data-tile="a"]') as HTMLElement)
    // The tiles are a RECORD now, not an input surface.
    expect(toggleTile).not.toHaveBeenCalled()
  })
})
