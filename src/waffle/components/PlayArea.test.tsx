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
import { act, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { GamePageCtx } from '../../common/lib/games'
import { gp } from '../../common/test/gamePlayers'
import type { WaffleGame, WafflePlayerState, SwapRow } from '../hooks/useGame'
import { db } from '../db'
import { invokeStartGameEdgeFn } from '../../common/lib/game/manifestRpcs'
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
// PlayArea's "New game" calls the start-game edge function directly (the same
// helper the manifest uses); mocked so no edge runtime is needed.
vi.mock('../../common/lib/game/manifestRpcs', () => ({ invokeStartGameEdgeFn: vi.fn() }))

const rpc = db.rpc as unknown as ReturnType<typeof vi.fn>
const startEdgeFn = invokeStartGameEdgeFn as unknown as ReturnType<typeof vi.fn>

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
    isMyTurn: true,
    currentTurnUserId: null,
    // A realistic setup blob — the info-column disclosure reads it (a `{}` here
    // would crash timerLabel, exactly the kind of render bug these tests guard).
    setup: { difficulty: 2, extra_swaps: 5, timer: { kind: 'none' } },
    status: null,
    globalFeedback: { show: vi.fn(), clear: vi.fn() },
    goToClub: vi.fn(),
    clubHandle: 'testclub',
    goToGame: vi.fn(),
    menu: { setGameSections: vi.fn(), openHelp: vi.fn(), requestBackToClub: vi.fn() },
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

  it('renders the coop win with the golf-style par verdict', () => {
    // 11 swaps against par 9 → "Par +2", shown in BOTH terminal spots: the
    // below-board pill (verdict) and the info-column outcome line (message).
    h.result = loaded(
      { ...coopGame, solution: ['crane', 'octal', 'slate', 'basin', 'rounds'].join('') },
      [{ ...me, swaps_used: 11, solved: true }],
    )
    render(<PlayArea {...makeCtx({ isTerminal: true, playState: 'won' })} />)
    expect(screen.getAllByText('Par +2')).toHaveLength(2)
  })

  it('renders an even-par coop win as "Par!"', () => {
    h.result = loaded(
      { ...coopGame, solution: ['crane', 'octal', 'slate', 'basin', 'rounds'].join('') },
      [{ ...me, swaps_used: 9, solved: true }],
    )
    render(<PlayArea {...makeCtx({ isTerminal: true, playState: 'won' })} />)
    expect(screen.getAllByText('Par!')).toHaveLength(2)
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
    const user = userEvent.setup()
    h.result = loaded(coopGame)
    render(<PlayArea {...makeCtx()} />)
    expect(screen.queryByRole('button', { name: /concede/i })).not.toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: /^end$/i }))
    await user.click(await screen.findByRole('button', { name: 'End game' }))
    await waitFor(() => expect(rpc).toHaveBeenCalledWith('end_game', { target_game: 'g1' }))
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
 * "New game" (menu): a FRESH game — new id, same setup/roster/mode — via the
 * same waffle-build-board edge function the manifest's startGameInClub uses,
 * then a jump into it (ctx.goToGame). The pinned request body is the feature's
 * contract: the CURRENT game's setup verbatim, every ctx player, this mode.
 */
describe('waffle PlayArea — new game (menu)', () => {
  /** The game sections most recently pushed to the menu, flattened to items. */
  const menuItems = (ctx: GamePageCtx) => {
    const calls = (ctx.menu.setGameSections as ReturnType<typeof vi.fn>).mock.calls
    const sections = calls.at(-1)![0] as { items: { id: string; onClick: () => void }[] }[]
    return sections.flatMap((s) => s.items)
  }

  it('starts a fresh game with this game\'s setup + roster + mode, then navigates', async () => {
    startEdgeFn.mockResolvedValue({ id: 'fresh-game-id' })
    h.result = loaded(coopGame, [me, moth])
    const ctx = makeCtx({ players: twoMembers })
    render(<PlayArea {...ctx} />)

    act(() => menuItems(ctx).find((i) => i.id === 'new-game')!.onClick())
    await waitFor(() =>
      expect(startEdgeFn).toHaveBeenCalledWith(
        'waffle-build-board',
        {
          target_club: 'testclub',
          setup: ctx.setup,
          player_user_ids: ['u1', 'u2'],
          mode: 'coop',
        },
        'SyrupSwap',
      ),
    )
    await waitFor(() => expect(ctx.goToGame).toHaveBeenCalledWith('waffle_coop', 'fresh-game-id'))
  })

  it('surfaces an edge-function error in the local pill (no navigation)', async () => {
    startEdgeFn.mockResolvedValue({ error: 'no words for that band' })
    h.result = loaded(coopGame)
    const ctx = makeCtx()
    render(<PlayArea {...ctx} />)

    act(() => menuItems(ctx).find((i) => i.id === 'new-game')!.onClick())
    await waitFor(() =>
      expect(screen.getByText('New game failed: no words for that band')).toBeInTheDocument(),
    )
    expect(ctx.goToGame).not.toHaveBeenCalled()
  })
})

/**
 * The icon-only action rows (waffle's experiment — labels live in tooltips):
 * PLAYING = End/Concede + Back-to-club (via the shell's suspend-confirm flow,
 * NOT direct navigation); TERMINAL = Restart + Reveal answer + New game +
 * Back-to-club. The terminal Reveal is LOCAL (no RPC, no confirm — the
 * solution is already on the client post-terminal) and disables once the
 * answer is showing.
 */
describe('waffle PlayArea — icon-only action rows', () => {
  // A hole-correct solution (the pgTAP/e2e fixture shape): across words are
  // ABCDE / IJKLM / QRSTU — what SolutionReveal shows once revealed.
  const FIXTURE_SOLUTION = 'abcdef.g.hijklmn.o.pqrstu'

  it('playing row offers Back-to-club through the suspend-confirm flow', async () => {
    const user = userEvent.setup()
    h.result = loaded(coopGame)
    const ctx = makeCtx()
    render(<PlayArea {...ctx} />)
    await user.click(screen.getByRole('button', { name: 'Back to club' }))
    expect(ctx.menu.requestBackToClub).toHaveBeenCalled()
    expect(ctx.goToClub).not.toHaveBeenCalled() // mid-game never direct-navigates
  })

  it('terminal "Reveal answer" shows the solution locally — no RPC, no confirm', async () => {
    const confirm = vi.spyOn(window, 'confirm').mockClear().mockReturnValue(false)
    const user = userEvent.setup()
    h.result = loaded({ ...coopGame, solution: FIXTURE_SOLUTION })
    render(<PlayArea {...makeCtx({ isTerminal: true, playState: 'lost' })} />)

    // The loss keeps the answer hidden (em dashes)…
    expect(screen.queryByText('ABCDE')).not.toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Reveal answer' }))
    // …the local reveal fills in the words, with no server call and no confirm.
    expect(screen.getByText('ABCDE')).toBeInTheDocument()
    expect(screen.getByText('QRSTU')).toBeInTheDocument()
    expect(confirm).not.toHaveBeenCalled()
    expect(rpc).not.toHaveBeenCalled()
  })

  it('terminal Reveal is disabled once the answer is showing (a win)', () => {
    h.result = loaded({ ...coopGame, solution: FIXTURE_SOLUTION }, [{ ...me, solved: true }])
    render(<PlayArea {...makeCtx({ isTerminal: true, playState: 'won' })} />)
    expect(screen.getByRole('button', { name: 'Reveal answer' })).toBeDisabled()
  })

  it('terminal "New game" button starts the follow-up game', async () => {
    startEdgeFn.mockResolvedValue({ id: 'next-game-id' })
    const user = userEvent.setup()
    h.result = loaded({ ...coopGame, solution: FIXTURE_SOLUTION })
    const ctx = makeCtx({ isTerminal: true, playState: 'lost' })
    render(<PlayArea {...ctx} />)
    await user.click(screen.getByRole('button', { name: 'New game' }))
    await waitFor(() => expect(ctx.goToGame).toHaveBeenCalledWith('waffle_coop', 'next-game-id'))
  })
})

/**
 * Terminal flow. Waffle deliberately skips the shared GameOverModal: the
 * verdict is carried in-page, the action row gains a Restart button (the
 * menu's replay-board, unconfirmed at terminal), and a coop solve pops the
 * CelebrationDialog — but ONLY at the moment of the win (the playState flip),
 * never when mounting an already-won game.
 */
describe('waffle PlayArea — terminal flow', () => {
  const solvedCoop: WaffleGame = {
    ...coopGame,
    solution: ['crane', 'octal', 'slate', 'basin', 'rounds'].join(''),
  }

  it('shows Restart (left of Club) and no GameOverModal at terminal', () => {
    h.result = loaded(solvedCoop)
    render(<PlayArea {...makeCtx({ isTerminal: true, playState: 'won' })} />)

    const restart = screen.getByRole('button', { name: 'Restart' })
    const club = screen.getByRole('button', { name: /club/i })
    // Restart precedes Back-to-Club in the row.
    expect(restart.compareDocumentPosition(club) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
    // No GameOverModal ("Game over" is its FloatingPanel title) — and no
    // celebration either: mounting an already-won game is review, not a win.
    expect(screen.queryByText('Game over')).not.toBeInTheDocument()
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  })

  it('Restart at terminal calls replay_board WITHOUT confirming', async () => {
    // Clear first: the concede tests above spied confirm too, and spy call
    // history persists across tests in this file.
    const confirm = vi.spyOn(window, 'confirm').mockClear().mockReturnValue(false)
    const user = userEvent.setup()
    h.result = loaded(solvedCoop)
    render(<PlayArea {...makeCtx({ isTerminal: true, playState: 'won' })} />)

    await user.click(screen.getByRole('button', { name: 'Restart' }))
    // confirm returned false — the RPC firing anyway proves it was skipped.
    expect(confirm).not.toHaveBeenCalled()
    expect(rpc).toHaveBeenCalledWith('replay_board', { target_game: 'g1' })
  })

  it('pops the celebration when the coop win lands mid-session', () => {
    h.result = loaded(solvedCoop)
    const { rerender } = render(<PlayArea {...makeCtx()} />)
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()

    // The winning swap arrives: playState flips to won via the realtime refetch.
    rerender(<PlayArea {...makeCtx({ isTerminal: true, playState: 'won' })} />)
    expect(screen.getByRole('dialog', { name: 'Solved it! 🧇' })).toBeInTheDocument()
  })

  it('does not celebrate a compete win', () => {
    h.result = loaded(competeGame, [me, moth])
    const ctx = { players: twoMembers, status: { winner: 'u1' } }
    const { rerender } = render(<PlayArea {...makeCtx(ctx)} />)

    rerender(
      <PlayArea {...makeCtx({ ...ctx, isTerminal: true, playState: 'won_compete' })} />,
    )
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    expect(screen.getByText('You won!')).toBeInTheDocument()
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
    over: Partial<SwapRow> & Pick<SwapRow, 'seq' | 'pos_a' | 'pos_b'>,
  ): SwapRow => ({ user_id: 'u2', letter_a: '?', letter_b: '?', ...over })
  // Solving sequence in log order: fix 2↔3 first, then 0↔1.
  const swaps = [
    swapRow({ seq: 1, pos_a: 2, pos_b: 3, letter_a: 'd', letter_b: 'c' }),
    swapRow({ seq: 2, pos_a: 0, pos_b: 1, letter_a: 'b', letter_b: 'a' }),
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
