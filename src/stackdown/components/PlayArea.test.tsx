/**
 * Render + behavior tests for stackdown's PlayArea, focused on the per-player
 * **concede** flow (the compete drop-out that replaced the whole-table End).
 *
 * Why this exists: concede branches the action row, the OpponentStrip metric,
 * and the "locally terminal" look by mode + per-player flag — glue a `tsc` pass
 * wouldn't catch (the root tsconfig checks nothing — see memory
 * project_typecheck_use_tsc_b). These prove the tree mounts in each mode AND
 * that the concede wiring is right: compete shows Concede and calls
 * `stackdown.concede`, coop shows End and calls `end_game`, a conceded opponent
 * reads "out" in the strip, and my own concede flips to the "You conceded" look.
 *
 * `useGame` (realtime + supabase) and `db` are mocked so no client/network is
 * needed; the board, entry row, opponent strip, and log all render real.
 */
import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { GamePageCtx } from '../../common/lib/games'
import { gp } from '../../common/test/gamePlayers'
import type { StackdownGame, PlayerRow, SubmissionRow } from '../hooks/useGame'
import type { Tile } from '../lib/board'
import { db } from '../db'
import { PlayArea } from './PlayArea'

// The mocked useGame's full return shape — a mutable holder set per test before
// render(). `vi.hoisted` runs before the (also-hoisted) `vi.mock` factory.
type GameHook = {
  game: StackdownGame | null
  players: PlayerRow[]
  submissions: SubmissionRow[]
  removedTileIds: Set<number>
  currentWord: number[]
  appendTile: (tileId: number) => number[] | null
  retractTo: (index: number) => void
  clearWord: () => void
  commitWord: (tileIds: number[]) => void
  loading: boolean
}

const h = vi.hoisted(() => ({ result: null as unknown as GameHook }))
vi.mock('../hooks/useGame', () => ({ useGame: () => h.result }))
vi.mock('../db', () => ({ db: { rpc: vi.fn() } }))

const rpc = db.rpc as unknown as ReturnType<typeof vi.fn>

/** A tiny 3-tile board — enough for the tree to render; the concede tests don't
 *  interact with the tiles. */
const tiles: Tile[] = [
  { id: 1, x: 0, y: 0, z: 0, letter: 'C' },
  { id: 2, x: 1, y: 0, z: 0, letter: 'A' },
  { id: 3, x: 2, y: 0, z: 0, letter: 'T' },
]

/** A loaded game; override the mode per test. */
function loadedGame(over: Partial<StackdownGame> = {}): StackdownGame {
  return {
    id: 'g1',
    club_handle: 'c1',
    mode: 'coop',
    tiles,
    created_at: '2026-01-01T00:00:00Z',
    solution: null,
    ...over,
  }
}

/** The full useGame hook return, with `players` (the public per-player tally) and
 *  the local-word actions stubbed. */
function loaded(game: StackdownGame, players: PlayerRow[] = []): GameHook {
  return {
    game,
    players,
    submissions: [],
    removedTileIds: new Set<number>(),
    currentWord: [],
    appendTile: vi.fn(() => null),
    retractTo: vi.fn(),
    clearWord: vi.fn(),
    commitWord: vi.fn(),
    loading: false,
  }
}

/** The public per-player tally row (stackdown.players). */
function playerRow(user_id: string, over: Partial<PlayerRow> = {}): PlayerRow {
  return { user_id, found_count: 0, solved: false, solved_at: null, ...over }
}

const twoMembers = [gp('u1', 'me', 'red'), gp('u2', 'moth', 'blue')]
const twoRows = [playerRow('u1'), playerRow('u2')]

function makeCtx(over: Partial<GamePageCtx> = {}): GamePageCtx {
  return {
    session: { user: { id: 'u1' } } as unknown as GamePageCtx['session'],
    gameId: 'g1',
    brand: 'StackDown',
    players: [gp('u1', 'me', 'red')],
    playState: 'playing',
    isTerminal: false,
    timer: { displaySeconds: 0, expired: false },
    setup: { timer: { kind: 'none' } },
    status: null,
    globalFeedback: { show: vi.fn(), clear: vi.fn() },
    goToClub: vi.fn(),
    clubHandle: 'testclub',
    goToGame: vi.fn(),
    menu: { setGameSections: vi.fn(), openHelp: vi.fn(), requestBackToClub: vi.fn() },
    ...over,
  } as unknown as GamePageCtx
}

beforeEach(() => {
  h.result = loaded(loadedGame(), [playerRow('u1')])
  rpc.mockReset()
  rpc.mockResolvedValue({ error: null, data: null })
})

describe('stackdown PlayArea — concede', () => {
  it('compete shows Concede and calls stackdown.concede on click', async () => {
    vi.spyOn(window, 'confirm').mockReturnValue(true)
    const user = userEvent.setup()
    h.result = loaded(loadedGame({ mode: 'compete' }), twoRows)
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

  it('marks a conceded opponent "out" in the strip (mid-game)', () => {
    h.result = loaded(loadedGame({ mode: 'compete' }), twoRows)
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
    h.result = loaded(loadedGame({ mode: 'compete' }), twoRows)
    render(
      <PlayArea
        {...makeCtx({
          players: [gp('u1', 'me', 'red', { conceded: true }), gp('u2', 'moth', 'blue')],
        })}
      />,
    )
    expect(screen.getByText('You conceded')).toBeInTheDocument()
  })
})

describe('stackdown PlayArea — hint', () => {
  it('surfaces the clue when the next word has a hint', async () => {
    const user = userEvent.setup()
    render(<PlayArea {...makeCtx()} />)
    rpc.mockResolvedValueOnce({ error: null, data: 'a fruit' })
    await user.click(screen.getByRole('button', { name: /^hint$/i }))
    expect(rpc).toHaveBeenCalledWith('reveal_next_hint', { target_game: 'g1' })
    expect(await screen.findByText('Hint: a fruit')).toBeInTheDocument()
  })

  it('a null hint reads as "no hint", NOT "all cleared"', async () => {
    // Regression: band-2 words may lack a hint, so reveal_next_hint returns
    // null even mid-game — which must not be mistaken for clearing the board.
    const user = userEvent.setup()
    render(<PlayArea {...makeCtx()} />)
    rpc.mockResolvedValueOnce({ error: null, data: null })
    await user.click(screen.getByRole('button', { name: /^hint$/i }))
    expect(await screen.findByText(/no hint for this word/i)).toBeInTheDocument()
    expect(screen.queryByText(/all .*cleared/i)).not.toBeInTheDocument()
  })
})

/**
 * Turn-history viewer (docs/playarea-decomposition-plan.md, Phase A). Clicking a
 * log row replays that turn's board; a keystroke / click returns to live. These
 * prove the cross-column seam is wired right — the snapshot logic itself is
 * unit-tested in lib/history.test.ts. Eight uniquely-lettered tiles so we can
 * probe a single cleared tile by its letter (L is in the cleared word CLEAR, not
 * in the remaining M/O/T).
 */
describe('stackdown PlayArea — turn-history viewer', () => {
  const historyTiles: Tile[] = [
    { id: 1, x: 0, y: 0, z: 0, letter: 'C' },
    { id: 2, x: 1, y: 0, z: 0, letter: 'L' },
    { id: 3, x: 2, y: 0, z: 0, letter: 'E' },
    { id: 4, x: 3, y: 0, z: 0, letter: 'A' },
    { id: 5, x: 4, y: 0, z: 0, letter: 'R' },
    { id: 6, x: 5, y: 0, z: 0, letter: 'M' },
    { id: 7, x: 6, y: 0, z: 0, letter: 'O' },
    { id: 8, x: 7, y: 0, z: 0, letter: 'T' },
  ]
  // A valid word cleared tiles 1..5 (CLEAR), then a hint was requested. Coop, so
  // the log shows both, in submitted_at order (index 0 = the word, 1 = the hint).
  const submissions: SubmissionRow[] = [
    { user_id: 'u2', seq: 1, kind: 'word', word: 'clear', tile_ids: [1, 2, 3, 4, 5], valid: true, submitted_at: '2026-01-01T00:00:01Z' },
    { user_id: 'u1', seq: 1, kind: 'hint', word: 'a fruit', tile_ids: null, valid: null, submitted_at: '2026-01-01T00:00:02Z' },
  ]

  /** A loaded coop hook whose board is the 8-tile fixture with CLEAR's tiles
   *  already off the live board. */
  function historyHook(): GameHook {
    return {
      ...loaded(loadedGame({ mode: 'coop', tiles: historyTiles }), twoRows),
      submissions,
      removedTileIds: new Set([1, 2, 3, 4, 5]),
    }
  }

  it('clicking a word row replays that turn; a keystroke returns to live', async () => {
    const user = userEvent.setup()
    h.result = historyHook()
    render(<PlayArea {...makeCtx({ players: twoMembers })} />)

    // Live: CLEAR's tiles are off the board (L is one of them).
    expect(screen.queryByText('L')).not.toBeInTheDocument()

    // Open the viewer via the turn's "#N" handle (the click target is the number,
    // not the row). The CLEAR row has two titled controls — the #N handle + the
    // definable word — so target the handle by its title.
    await user.click(
      within(screen.getByText('CLEAR').closest('tr')!).getByTitle(
        'Click to view this turn on the board',
      ),
    )

    // Viewing turn 0: the yellow viewer banner shows the description, and CLEAR's
    // tiles are back on the historical board (nothing was cleared before it).
    expect(screen.getByText('Cleared CLEAR')).toBeInTheDocument()
    expect(screen.getByText('L')).toBeInTheDocument()

    // Any key returns to live — the banner clears and the tiles leave again.
    await user.keyboard('x')
    expect(screen.queryByText('Cleared CLEAR')).not.toBeInTheDocument()
    expect(screen.queryByText('L')).not.toBeInTheDocument()
  })

  it('viewing a later (hint) turn shows the board AS OF that turn — earlier word already cleared', async () => {
    const user = userEvent.setup()
    h.result = historyHook()
    render(<PlayArea {...makeCtx({ players: twoMembers })} />)

    await user.click(
      within(screen.getByText('Hint: a fruit').closest('tr')!).getByTitle(
        'Click to view this turn on the board',
      ),
    )

    // The hint's description now also appears in the banner (2 = log row + banner).
    expect(screen.getAllByText('Hint: a fruit')).toHaveLength(2)
    // A hint cleared nothing, and CLEAR (before it) had — so the historical board
    // still has CLEAR's tiles OFF (strictly-before boundary).
    expect(screen.queryByText('L')).not.toBeInTheDocument()
  })
})
