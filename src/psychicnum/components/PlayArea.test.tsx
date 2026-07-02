/**
 * Component tests for psychicnum's PlayArea — focused on the per-player
 * CONCEDE flow (compete drop-out) and its coop counterpart (whole-table End).
 *
 * psychicnum is an ELIMINATION game: each player has an independent guess
 * budget, so "done for me" (out of budget, or conceded) can happen while the
 * others keep racing. Concede is the deliberate version of that — a real loss
 * that leaves the rest playing (the opposite of coop's end_game, which stops the
 * game for everyone). These tests pin the wiring: compete offers Concede →
 * psychicnum.concede; coop offers End → psychicnum.end_game; a conceded opponent
 * reads "out" mid-game; and after I concede I get the locally-terminal look.
 *
 * `useGame` (realtime + supabase) and `db` are mocked so no client/network is
 * needed; everything else — the board, entry, strip, action row — renders for
 * real. Mirrors wordle's concede tests (the elimination template, commit c1b5df8).
 */
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { GamePageCtx } from '../../common/lib/games'
import { gp } from '../../common/test/gamePlayers'
import type { PsychicnumGame, PsychicnumPlayer, PsychicnumGuess } from '../hooks/useGame'
import { db } from '../db'
import { PlayArea } from './PlayArea'

type GameHook = {
  game: PsychicnumGame | null
  players: PsychicnumPlayer[]
  guesses: PsychicnumGuess[]
  loading: boolean
}

// A mutable holder the mocked useGame returns each render — set per test before
// render(). `vi.hoisted` runs before the (also-hoisted) `vi.mock` factory, so
// the factory can close over it safely.
const h = vi.hoisted(() => ({ result: null as unknown as GameHook }))
vi.mock('../hooks/useGame', () => ({ useGame: () => h.result }))
vi.mock('../db', () => ({ db: { rpc: vi.fn() } }))

const rpc = db.rpc as unknown as ReturnType<typeof vi.fn>

// Budget rows (psychicnum.players): guesses_remaining > 0 so the viewer can act
// (the "playing" action row with its End/Concede button shows).
const me: PsychicnumPlayer = { user_id: 'u1', guesses_remaining: 7, secrets_found: 0 }
const moth: PsychicnumPlayer = { user_id: 'u2', guesses_remaining: 7, secrets_found: 0 }

/** A loaded game-hook result; override the game header + budget rows per test. */
function loaded(game: PsychicnumGame, players: PsychicnumPlayer[] = [me]): GameHook {
  return { game, players, guesses: [], loading: false }
}

/** A board word list — WordBoard renders a tile per word; needs at least one. */
const WORDS = ['alpha', 'bravo', 'charlie', 'delta', 'echo']

function makeCtx(over: Partial<GamePageCtx> = {}): GamePageCtx {
  return {
    session: { user: { id: 'u1' } } as unknown as GamePageCtx['session'],
    gameId: 'g1',
    players: [gp('u1', 'me', 'red')],
    playState: 'playing',
    isTerminal: false,
    timer: { displaySeconds: 0, expired: false },
    // A realistic setup blob — the info column reads `guesses` + `difficulty`.
    setup: { guesses: 7, word_count: 10, difficulty: 3, timer: { kind: 'none' } },
    status: null,
    globalFeedback: { show: vi.fn(), clear: vi.fn() },
    goToClub: vi.fn(),
    menu: { setGameItems: vi.fn() },
    ...over,
  } as unknown as GamePageCtx
}

const competeGame: PsychicnumGame = {
  id: 'g1',
  club_handle: 'club',
  mode: 'compete',
  words: WORDS,
  secrets: null,
  created_at: '2026-07-02',
}
const coopGame: PsychicnumGame = { ...competeGame, mode: 'coop' }

beforeEach(() => {
  h.result = loaded(coopGame)
  rpc.mockReset()
  rpc.mockResolvedValue({ error: null })
})

describe('psychicnum PlayArea — concede', () => {
  it('compete shows Concede and calls psychicnum.concede on click', async () => {
    vi.spyOn(window, 'confirm').mockReturnValue(true)
    const user = userEvent.setup()
    h.result = loaded(competeGame, [me, moth])
    render(<PlayArea {...makeCtx({ players: [gp('u1', 'me', 'red'), gp('u2', 'moth', 'blue')] })} />)
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
        {...makeCtx({
          players: [gp('u1', 'me', 'red'), gp('u2', 'moth', 'blue', { conceded: true })],
        })}
      />,
    )
    expect(screen.getByText('out')).toBeInTheDocument()
  })

  it('shows the "You conceded" locally-terminal look after I concede', () => {
    h.result = loaded(competeGame, [me, moth])
    render(
      <PlayArea
        {...makeCtx({
          players: [gp('u1', 'me', 'red', { conceded: true }), gp('u2', 'moth', 'blue')],
        })}
      />,
    )
    // The info-column action row swaps to the terminal LOOK, and the below-board
    // pill narrates the drop-out — both read "You conceded…".
    expect(screen.getByText('You conceded')).toBeInTheDocument()
    expect(screen.getByText(/You conceded — the rest are still racing/)).toBeInTheDocument()
  })
})
