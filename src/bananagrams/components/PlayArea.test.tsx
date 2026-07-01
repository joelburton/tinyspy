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
import { render, screen } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { GamePageCtx } from '../../common/lib/games'
import type { BananagramsProgress } from '../hooks/useGame'
import { PlayArea } from './PlayArea'

type GameHook = { initialBoard: string | null; tiles: string; loading: boolean }

// Mutable holders the mocked hooks return each render — set per test.
const h = vi.hoisted(() => ({
  game: null as unknown as GameHook,
  progress: [] as BananagramsProgress[],
}))
vi.mock('../hooks/useGame', () => ({
  useGame: () => h.game,
  useProgress: () => h.progress,
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

function progressRow(over: Partial<BananagramsProgress> & { user_id: string }): BananagramsProgress {
  return { unplaced: 0, placed: 0, done: false, conceded: false, ...over }
}

const SETUP = {
  hand_size: 21,
  bag_size: 144,
  check_words: false,
  dict_2: 4,
  dict_3plus: 4,
  dump_to_box: false,
  timer: { kind: 'none' },
}

function makeCtx(over: Partial<GamePageCtx> = {}): GamePageCtx {
  return {
    session: { user: { id: 'u1' } } as unknown as GamePageCtx['session'],
    gameId: 'g1',
    brand: 'MonkeyGrams',
    players: [{ user_id: 'u1', username: 'me', color: 'red' }],
    playState: 'playing',
    isTerminal: false,
    timer: { displaySeconds: 0, expired: false },
    setup: SETUP,
    status: { pool_remaining: 100, box_remaining: 0 },
    feedback: { show: vi.fn(), clear: vi.fn() },
    goToClub: vi.fn(),
    menu: { setGameItems: vi.fn() },
    ...over,
  }
}

beforeEach(() => {
  h.game = loaded()
  h.progress = [progressRow({ user_id: 'u1', unplaced: 7 })]
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
      { user_id: 'u1', username: 'me', color: 'red' },
      { user_id: 'u2', username: 'moth', color: 'blue' },
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
    // The short info-column outcome line + the fuller verdict (which shows in
    // both the below-board pill and the GameOverModal).
    expect(screen.getByText('You won!')).toBeInTheDocument()
    expect(screen.getAllByText(/Bananas! You went out first/).length).toBeGreaterThan(0)
  })

  it('renders the locally-terminal "you conceded" state (frozen, others racing)', () => {
    h.progress = [progressRow({ user_id: 'u1', conceded: true })]
    render(<PlayArea {...makeCtx()} />)
    // The action row shows "You're out" + back-to-club — no Peel and no Concede
    // (the conceder is frozen out; the row is the terminal look).
    expect(screen.getAllByText(/you.?re out/i).length).toBeGreaterThan(0)
    expect(screen.queryByRole('button', { name: /concede/i })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Peel' })).not.toBeInTheDocument()
  })
})
