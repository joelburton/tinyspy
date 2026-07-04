/**
 * Render + concede tests for waffle's PlayArea: does the play surface mount
 * without throwing (coop / compete / terminal), and does the per-player concede
 * wiring behave — compete offers Concede (→ waffle.concede), coop offers End
 * (→ end_game), a conceded opponent reads 'out', and after I concede the
 * locally-terminal look says "You conceded".
 *
 * Why this exists: a one-line `render()` catches the "removed a prop that's still
 * referenced → blank page" class of runtime bug that `tsc --noEmit` can't (the
 * root tsconfig checks nothing; see memory project_typecheck_use_tsc_b). The
 * concede block guards the wiring that was previously wrong — the compete button
 * called `handleEndGame` (End) instead of `handleConcede`.
 *
 * `useGame` (realtime + supabase) and `db` are mocked so no client/network is
 * needed; everything else — the grid, strips, action row — renders for real.
 */
import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { GamePageCtx } from '../../common/lib/games'
import { gp } from '../../common/test/gamePlayers'
import type { WaffleGame, WafflePlayerState, SwapRow } from '../hooks/useGame'
import { db } from '../db'
import { PlayArea } from './PlayArea'

type GameHook = {
  game: WaffleGame | null
  players: WafflePlayerState[]
  swaps: SwapRow[]
  loading: boolean
}

// A mutable holder the mocked useGame returns each render — set per test before
// render(). `vi.hoisted` runs before the (also-hoisted) `vi.mock` factory, so
// the factory can close over it safely.
const h = vi.hoisted(() => ({ result: null as unknown as GameHook }))
vi.mock('../hooks/useGame', () => ({ useGame: () => h.result }))
vi.mock('../db', () => ({ db: { rpc: vi.fn() } }))

const rpc = db.rpc as unknown as ReturnType<typeof vi.fn>

// A 25-char board (holes at 6/8/16/18); the exact letters don't matter for these
// mount-level tests — holes render as gaps regardless of what sits there.
const BOARD = 'CRANE.O.TSLATEB.I.ROUNDS'.padEnd(25, 'X')

const me: WafflePlayerState = {
  user_id: 'u1', board: BOARD, colors: null, swaps_used: 0, solved: false, solved_at: null,
}
const moth: WafflePlayerState = {
  user_id: 'u2', board: BOARD, colors: null, swaps_used: 0, solved: false, solved_at: null,
}

/** Two club members, for the compete strip / concede tests. */
const twoMembers = [gp('u1', 'me', 'red'), gp('u2', 'moth', 'blue')]

/** A loaded game-hook result; override the game header + players per test. */
function loaded(
  game: WaffleGame,
  players: WafflePlayerState[] = [me],
  swaps: SwapRow[] = [],
): GameHook {
  return { game, players, swaps, loading: false }
}

const coopGame: WaffleGame = {
  id: 'g1', mode: 'coop', scramble: BOARD, par_swaps: 9, max_swaps: 14, solution: null,
}
const competeGame: WaffleGame = {
  id: 'g1', mode: 'compete', scramble: BOARD, par_swaps: 9, max_swaps: 14, solution: null,
}

function makeCtx(over: Partial<GamePageCtx> = {}): GamePageCtx {
  return {
    session: { user: { id: 'u1' } } as unknown as GamePageCtx['session'],
    gameId: 'g1',
    brand: 'SyrupSwap',
    title: 'Test game',
    players: [gp('u1', 'me', 'red')],
    playState: 'playing',
    isTerminal: false,
    timer: { displaySeconds: 0, expired: false },
    // A realistic setup blob — the info-column disclosure reads it (a `{}` here
    // would crash timerLabel, exactly the kind of render bug these tests guard).
    setup: { difficulty: 2, extra_swaps: 5, timer: { kind: 'none' } },
    status: null,
    globalFeedback: { show: vi.fn(), clear: vi.fn() },
    goToClub: vi.fn(),
    menu: { setGameItems: vi.fn() },
    ...over,
  }
}

beforeEach(() => {
  h.result = loaded(coopGame)
  rpc.mockReset()
  rpc.mockResolvedValue({ error: null })
})

describe('waffle PlayArea — render smoke', () => {
  it('renders the board in coop play', () => {
    render(<PlayArea {...makeCtx()} />)
    expect(screen.getByRole('grid', { name: /waffle board/i })).toBeInTheDocument()
  })

  it('renders the board in compete play', () => {
    h.result = loaded(competeGame, [me, moth])
    render(<PlayArea {...makeCtx({ players: twoMembers })} />)
    expect(screen.getByRole('grid', { name: /waffle board/i })).toBeInTheDocument()
  })

  it('renders the terminal state without crashing', () => {
    h.result = loaded({ ...coopGame, solution: ['crane', 'octal', 'slate', 'basin', 'rounds'].join('') })
    render(<PlayArea {...makeCtx({ isTerminal: true, playState: 'won' })} />)
    expect(screen.getByText('Solved!')).toBeInTheDocument()
  })
})

describe('waffle PlayArea — concede', () => {
  it('compete shows Concede and calls waffle.concede on click', async () => {
    vi.spyOn(window, 'confirm').mockReturnValue(true)
    const user = userEvent.setup()
    h.result = loaded(competeGame, [me, moth])
    render(<PlayArea {...makeCtx({ players: twoMembers })} />)
    await user.click(screen.getByRole('button', { name: /concede/i }))
    expect(rpc).toHaveBeenCalledWith('concede', { target_game: 'g1' })
  })

  it('coop shows End (not Concede) and calls end_game', async () => {
    vi.spyOn(window, 'confirm').mockReturnValue(true)
    const user = userEvent.setup()
    h.result = loaded(coopGame)
    render(<PlayArea {...makeCtx()} />)
    expect(screen.queryByRole('button', { name: /concede/i })).not.toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: /^end$/i }))
    expect(rpc).toHaveBeenCalledWith('end_game', { target_game: 'g1' })
  })

  it('marks a conceded opponent "out" in the strip', () => {
    h.result = loaded(competeGame, [me, moth])
    render(
      <PlayArea
        {...makeCtx({ players: [gp('u1', 'me', 'red'), gp('u2', 'moth', 'blue', { conceded: true })] })}
      />,
    )
    expect(screen.getByText('out')).toBeInTheDocument()
  })

  it('shows the "You conceded" locally-terminal look after I concede', () => {
    h.result = loaded(competeGame, [me, moth])
    render(
      <PlayArea
        {...makeCtx({ players: [gp('u1', 'me', 'red', { conceded: true }), gp('u2', 'moth', 'blue')] })}
      />,
    )
    // The bold action-row status (exact) — the below-board pill carries the
    // longer "You conceded — the rest are still racing." variant.
    expect(screen.getByText('You conceded')).toBeInTheDocument()
  })
})

/**
 * Turn-history viewer (coop). Clicking a swap-log row replays that swap's board;
 * a keystroke / the ✕ returns to live. The snapshot + color logic is unit-tested
 * in lib/{history,colors}.test.ts; this proves the PlayArea wiring. Uses the
 * 21-distinct-letter reference board so cell 0's letter distinguishes the states.
 */
describe('waffle PlayArea — turn-history viewer (coop)', () => {
  const SOLUTION = 'abcdef.g.hijklmn.o.pqrstu'
  const SCRAMBLE = 'badcef.g.hijklmn.o.pqrstu' // cells 0,1 and 2,3 swapped
  const swapRow = (
    over: Partial<SwapRow> & Pick<SwapRow, 'swap_index' | 'pos_a' | 'pos_b'>,
  ): SwapRow => ({ user_id: 'u2', letter_a: '?', letter_b: '?', ...over })
  // Solving sequence in log order: fix 2↔3 first, then 0↔1.
  const swaps = [
    swapRow({ swap_index: 1, pos_a: 2, pos_b: 3, letter_a: 'd', letter_b: 'c' }),
    swapRow({ swap_index: 2, pos_a: 0, pos_b: 1, letter_a: 'b', letter_b: 'a' }),
  ]
  // A coop game whose live board is the solved arrangement (cell 0 = 'a').
  const withHistory = (): GameHook =>
    loaded({ ...coopGame, scramble: SCRAMBLE, solution: SOLUTION }, [{ ...me, board: SOLUTION }], swaps)

  /** The first filled tile (cell 0) — its letter tells live ('A') from a snapshot. */
  const cell0 = () => within(screen.getByRole('grid')).getAllByRole('button')[0]

  it('clicking a swap row replays that swap; the ✕ returns to live', async () => {
    const user = userEvent.setup()
    h.result = withHistory()
    render(<PlayArea {...makeCtx({ players: twoMembers })} />)

    // Live: cell 0 is 'a'.
    expect(cell0()).toHaveTextContent('A')

    // View swap #1 → the board AFTER only the 2↔3 swap (cell 0 still 'b'); the
    // banner shows the swap description.
    await user.click(screen.getByText('#1', { exact: true, selector: 'span' }))
    expect(screen.getByText('#1: D (C1) ↔ C (D1)')).toBeInTheDocument()
    expect(cell0()).toHaveTextContent('B')

    // The ✕ returns to live.
    await user.click(screen.getByLabelText('Exit viewing'))
    expect(cell0()).toHaveTextContent('A')
    expect(screen.queryByText('#1: D (C1) ↔ C (D1)')).not.toBeInTheDocument()
  })

  it('a keystroke returns to live', async () => {
    const user = userEvent.setup()
    h.result = withHistory()
    render(<PlayArea {...makeCtx({ players: twoMembers })} />)

    await user.click(screen.getByText('#2', { exact: true, selector: 'span' }))
    expect(screen.getByLabelText('Exit viewing')).toBeInTheDocument()

    await user.keyboard('x')
    expect(screen.queryByLabelText('Exit viewing')).not.toBeInTheDocument()
  })
})
