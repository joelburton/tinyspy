/**
 * Guard test for codenamesduet's guess dispatch (code-review §1.4): a second
 * guess while one is already in flight must NOT fire a second `submit_guess`.
 *
 * The board disables the *pending* tile once `setPendingPos` re-renders, but that
 * (a) is async — it misses a same-tick double-tap — and (b) only disables the ONE
 * clicked tile, so clicking a DIFFERENT tile mid-guess still fires. The synchronous
 * `guessInFlight` ref closes both windows; this test exercises the second (click a
 * different tile while the first guess is in flight).
 *
 * `useGame` / `useBoard` / `useClues` / `db` are mocked; the game state is set up
 * as "my turn to guess" (I'm the guesser seat B; peer seat A gave the clue), so the
 * tiles are clickable.
 */
import { fireEvent, render, screen } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { GamePageCtx } from '../../common/lib/games'
import { db } from '../db'
import { PlayArea } from './PlayArea'

vi.mock('../hooks/useGame', () => ({
  useGame: () => ({
    game: { current_clue_giver: 'A', turn_number: 1 },
    players: [
      { user_id: 'me', seat: 'B', username: 'me', color: 'red' },
      { user_id: 'peer', seat: 'A', username: 'peer', color: 'blue' },
    ],
  }),
}))
vi.mock('../hooks/useBoard', () => ({
  // A full 5×5 board (PlayArea gates on `words.length >= 25`). Positions 0/1 are
  // the tiles we click; the rest are filler. All unrevealed → all clickable.
  useBoard: () => ({
    words: Array.from({ length: 25 }, (_, i) => ({
      position: i,
      word: i === 0 ? 'apple' : i === 1 ? 'berry' : `word${i}`,
      revealed_as: null,
      neutral_a: false,
      neutral_b: false,
    })),
    guesses: [],
    myKey: Array.from({ length: 25 }, () => 'N'),
    peerKey: null,
    myAgentsDone: false,
    peerAgentsDone: false,
    loading: false,
  }),
}))
vi.mock('../hooks/useClues', () => ({
  useClues: () => ({ clues: [{ turn_number: 1, word: 'fruit', count: 2 }] }),
}))
vi.mock('../db', () => ({ db: { rpc: vi.fn() } }))

const rpc = db.rpc as unknown as ReturnType<typeof vi.fn>

function makeCtx(over: Partial<GamePageCtx> = {}): GamePageCtx {
  return {
    session: { user: { id: 'me' } } as unknown as GamePageCtx['session'],
    gameId: 'g1',
    brand: 'TinySpy',
    players: [],
    playState: 'playing',
    isTerminal: false,
    timer: { displaySeconds: 0, expired: false },
    setup: { turns: 9, timer: { kind: 'none' } },
    status: null,
    globalFeedback: { show: vi.fn(), clear: vi.fn() },
    goToClub: vi.fn(),
    menu: { setGameSections: vi.fn(), openHelp: vi.fn(), requestBackToClub: vi.fn() },
    ...over,
  } as unknown as GamePageCtx
}

beforeEach(() => {
  rpc.mockReset()
  // Never resolves → the first guess stays "in flight" so we can test the guard.
  rpc.mockReturnValue(new Promise(() => {}))
})

describe('codenamesduet PlayArea — guess in-flight guard', () => {
  it('a second guess while one is in flight does not fire a second submit_guess', () => {
    render(<PlayArea {...makeCtx()} />)
    const apple = screen.getByRole('button', { name: /apple/i })
    const berry = screen.getByRole('button', { name: /berry/i })
    fireEvent.click(apple) // guess in flight (rpc never resolves)
    fireEvent.click(berry) // a DIFFERENT tile — not disabled, but the ref must block it
    expect(rpc).toHaveBeenCalledTimes(1)
    expect(rpc).toHaveBeenCalledWith('submit_guess', { target_game: 'g1', target_position: 0 })
  })
})

/**
 * Input-gating characterization. The board-gate prop (being unified to
 * `readOnly`) controls whether board tiles accept clicks. Pinning the OBSERVABLE
 * effect — tiles clickable during my guess turn, blocked at terminal — so a
 * polarity flip that inverts the gate fails here instead of silently shipping.
 */
describe('codenamesduet PlayArea — input gating', () => {
  it('tiles are clickable during my guess turn', () => {
    render(<PlayArea {...makeCtx()} />) // playing, my turn, clue given → gate open
    expect(screen.getByRole('button', { name: /apple/i })).toBeEnabled()
  })

  it('tiles are blocked at terminal', () => {
    render(<PlayArea {...makeCtx({ playState: 'won', isTerminal: true })} />) // gameOver
    expect(screen.getByRole('button', { name: /apple/i })).toBeDisabled()
  })
})
