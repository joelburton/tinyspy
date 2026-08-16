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
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
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
// The third argument is "show me the partner's key card" — the ONE thing the
// terminal reveal does, since useBoard is what turns it into `peerKey`. Recorded
// so the reveal tests can assert on it (the hook itself is mocked out).
const peerKeyArgs = vi.hoisted(() => ({ calls: [] as boolean[] }))
vi.mock('../hooks/useBoard', () => ({
  // A full 5×5 board (PlayArea gates on `words.length >= 25`). Positions 0/1 are
  // the tiles we click; the rest are filler. All unrevealed → all clickable.
  useBoard: (_gameId: string, _userId: string, showPeerKey: boolean) => (
    peerKeyArgs.calls.push(showPeerKey), {
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
  }
  ),
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
    isMyTurn: true,
    currentTurnUserId: null,
    setup: { turns: 9, timer: { kind: 'none' } },
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

/**
 * The terminal partner-key reveal. Duet's post-mortem is two people thinking out
 * loud — "wait, I was about to pick APPLE" — and that conversation only happens
 * while the card is still covered, so nothing opens it automatically, a win
 * included. The ask is LOCAL: it used to open the card on both screens at once,
 * which ended the partner's thinking mid-sentence.
 *
 * `useBoard`'s third argument IS the reveal (it's what produces `peerKey`), so
 * that's what these assert on — the hook itself is mocked.
 */
describe('codenamesduet PlayArea — the terminal partner-key reveal', () => {
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

  const lastPeerKeyArg = () => peerKeyArgs.calls.at(-1)

  beforeEach(() => {
    peerKeyArgs.calls.length = 0
  })

  it('keeps the card covered at a terminal until I ask — a win included', () => {
    render(<PlayArea {...makeCtx({ isTerminal: true, playState: 'won' })} />)
    expect(lastPeerKeyArg()).toBe(false)
    expect(screen.getByRole('button', { name: "Reveal partner's key" })).toBeEnabled()
  })

  it('Reveal opens it for me alone, and Hide covers it again', async () => {
    const user = userEvent.setup()
    render(<PlayArea {...makeCtx({ isTerminal: true, playState: 'lost' })} />)

    await user.click(screen.getByRole('button', { name: "Reveal partner's key" }))
    expect(lastPeerKeyArg()).toBe(true)
    // Local state: no RPC, so the partner's own card stays covered.
    expect(rpc).not.toHaveBeenCalled()

    await user.click(screen.getByRole('button', { name: "Hide partner's key" }))
    expect(lastPeerKeyArg()).toBe(false)
  })

  it('the menu twin is the same toggle, and inert mid-game', async () => {
    const live = makeCtx()
    const { unmount } = render(<PlayArea {...live} />)
    // Mid-game the partner's card is the whole game — nothing to reveal.
    expect(menuItems(live).get('reveal')?.disabled).toBe(true)
    unmount()

    const done = makeCtx({ isTerminal: true, playState: 'lost' })
    render(<PlayArea {...done} />)
    expect(menuItems(done).get('reveal')?.label).toBe("Reveal partner's key")
    act(() => menuItems(done).get('reveal')!.onClick())
    expect(lastPeerKeyArg()).toBe(true)
    await waitFor(() => expect(menuItems(done).get('reveal')?.label).toBe("Hide partner's key"))
  })
})
