/**
 * Render smoke tests for wordle's PlayArea: does the play surface mount and
 * render without throwing — in coop, in compete, and at terminal?
 *
 * Why this exists: a Phase-2 refactor removed a prop that was still referenced,
 * and the app shipped a BLANK PAGE (a runtime `ReferenceError`, not a type
 * error `tsc --noEmit` would surface — the root tsconfig checks nothing; see
 * memory project_typecheck_use_tsc_b). A one-line `render()` catches that class
 * of bug instantly. These are deliberately shallow: game logic lives in pgTAP
 * (the RPCs) and `colors.test.ts` (the render mapping); here we only prove the
 * component tree mounts.
 *
 * `useGame` (realtime + supabase) and `db` are mocked so no client/network is
 * needed; everything else — the grid, keyboard, lists, modal — renders for real.
 */
import { render, screen } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { GamePageCtx } from '../../common/lib/games'
import type { WordleGame, WordlePlayerState, WordleGuess } from '../hooks/useGame'
import { PlayArea } from './PlayArea'

type GameHook = {
  game: WordleGame | null
  players: WordlePlayerState[]
  guesses: WordleGuess[]
  loading: boolean
}

// A mutable holder the mocked useGame returns each render — set per test before
// render(). `vi.hoisted` runs before the (also-hoisted) `vi.mock` factory, so
// the factory can close over it safely.
const h = vi.hoisted(() => ({ result: null as unknown as GameHook }))
vi.mock('../hooks/useGame', () => ({ useGame: () => h.result }))
vi.mock('../db', () => ({ db: { rpc: vi.fn() } }))

const me: WordlePlayerState = { user_id: 'u1', guesses_used: 0, solved: false, solved_at: null }

/** A loaded game-hook result; override the game header per test. */
function loaded(game: WordleGame, guesses: WordleGuess[] = []): GameHook {
  return { game, players: [me], guesses, loading: false }
}

function makeCtx(over: Partial<GamePageCtx> = {}): GamePageCtx {
  return {
    session: { user: { id: 'u1' } } as unknown as GamePageCtx['session'],
    gameId: 'g1',
    brand: 'WordNerd',
    players: [{ user_id: 'u1', username: 'me', color: 'red' }],
    playState: 'playing',
    isTerminal: false,
    timer: { displaySeconds: 0, expired: false },
    // A realistic setup blob — the info-column disclosure reads it (a `{}` here
    // would crash timerLabel, exactly the kind of render bug these tests guard).
    setup: { max_guesses: 6, answer_source: 0, legal_guess: 4, timer: { kind: 'none' } },
    status: null,
    feedback: { show: vi.fn(), clear: vi.fn() },
    goToClub: vi.fn(),
    menu: { setGameItems: vi.fn() },
    ...over,
  }
}

beforeEach(() => {
  h.result = loaded({ id: 'g1', mode: 'coop', max_guesses: 6, target: null })
})

describe('wordle PlayArea — render smoke', () => {
  it('renders the board in coop play', () => {
    render(<PlayArea {...makeCtx()} />)
    expect(screen.getByRole('grid', { name: /board/i })).toBeInTheDocument()
  })

  it('renders the board in compete play', () => {
    h.result = loaded({ id: 'g1', mode: 'compete', max_guesses: 6, target: null })
    render(<PlayArea {...makeCtx()} />)
    expect(screen.getByRole('grid', { name: /board/i })).toBeInTheDocument()
  })

  it('renders the terminal state without crashing', () => {
    h.result = loaded({ id: 'g1', mode: 'coop', max_guesses: 6, target: 'crane' })
    render(<PlayArea {...makeCtx({ isTerminal: true, playState: 'won' })} />)
    expect(screen.getByRole('grid', { name: /board/i })).toBeInTheDocument()
    // The info-column outcome line (the answer reveal lands in Phase 4).
    expect(screen.getByText('Solved it!')).toBeInTheDocument()
  })
})
