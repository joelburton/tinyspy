/**
 * Render + behavior tests for spellingbee's PlayArea.
 *
 * Why this exists: the trusting-commit refactor rewired the whole submit path
 * (the shared `useWordSubmit` hook, the un-gated word lists, the client-side
 * reveal), and spellingbee's PlayArea (the largest FE file in that change) had NO
 * component coverage — a blank-page runtime error wouldn't be caught by `tsc`
 * (the root tsconfig checks nothing — see memory project_typecheck_use_tsc_b).
 * These prove the tree mounts in every mode AND that the spellingbee-specific
 * glue works: the local lookup accepts a required/bonus/pangram word (optimistic
 * pill + `submit_word` call) and rejects a non-legal one with the right reason.
 * Deep game logic still lives in pgTAP + the lib Vitest suites (ranks / pangram /
 * letterMask / displayRows); here we cover the composition.
 *
 * `useGame` (realtime + supabase) and `db` are mocked so no client/network is
 * needed; everything else — the honeycomb, RankBar, entry row, word list — renders
 * real.
 */
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { GamePageCtx } from '../../common/lib/games'
import type { SpellingbeeGame, FoundWordRow } from '../hooks/useGame'
import { db } from '../db'
import { PlayArea } from './PlayArea'

type GameHook = {
  game: SpellingbeeGame | null
  foundWords: FoundWordRow[]
  loading: boolean
}

// A mutable holder the mocked useGame returns each render — set per test before
// render(). `vi.hoisted` runs before the (also-hoisted) `vi.mock` factory.
const h = vi.hoisted(() => ({ result: null as unknown as GameHook }))
vi.mock('../hooks/useGame', () => ({ useGame: () => h.result }))
vi.mock('../db', () => ({ db: { rpc: vi.fn() } }))

const rpc = db.rpc as unknown as ReturnType<typeof vi.fn>

/** A loaded coop game: outer `cabdfg` + center `e`; required `bead` + the pangram
 *  `abcdefg`; one bonus word `bcdfge`. Override the mode per test. */
function loadedGame(over: Partial<SpellingbeeGame> = {}): SpellingbeeGame {
  return {
    id: 'g1',
    club_handle: 'c1',
    mode: 'coop',
    outer_letters: 'cabdfg',
    center_letter: 'e',
    required_words_score: 18,
    required_words_count: 2,
    created_at: '2026-01-01T00:00:00Z',
    requiredWords: [
      { word: 'bead', points: 1, is_pangram: false },
      { word: 'abcdefg', points: 17, is_pangram: true },
    ],
    bonusWords: [{ word: 'bcdfge', points: 6, is_pangram: false }],
    ...over,
  }
}

function loaded(game: SpellingbeeGame, foundWords: FoundWordRow[] = []): GameHook {
  return { game, foundWords, loading: false }
}

const twoMembers = [
  { user_id: 'u1', username: 'me', color: 'red' },
  { user_id: 'u2', username: 'moth', color: 'blue' },
]

function makeCtx(over: Partial<GamePageCtx> = {}): GamePageCtx {
  return {
    session: { user: { id: 'u1' } } as unknown as GamePageCtx['session'],
    gameId: 'g1',
    brand: 'FreeBee',
    players: [{ user_id: 'u1', username: 'me', color: 'red' }],
    playState: 'playing',
    isTerminal: false,
    timer: { displaySeconds: 0, expired: false },
    // A realistic setup blob — the info-column disclosure + rank target read it.
    setup: { required: 3, legal: 5, timer: { kind: 'none' } },
    status: null,
    globalFeedback: { show: vi.fn(), clear: vi.fn() },
    goToClub: vi.fn(),
    menu: { setGameItems: vi.fn() },
    ...over,
  } as unknown as GamePageCtx
}

beforeEach(() => {
  h.result = loaded(loadedGame())
  rpc.mockReset()
  rpc.mockResolvedValue({ error: null }) // trusting-commit succeeds by default
})

describe('spellingbee PlayArea — render smoke', () => {
  it('renders the honeycomb + RankBar + Stats in coop play', () => {
    render(<PlayArea {...makeCtx()} />)
    expect(screen.getByRole('group', { name: /honeycomb/i })).toBeInTheDocument()
    // The center letter is a labelled hex button.
    expect(screen.getByRole('button', { name: /center letter/i })).toBeInTheDocument()
    // The WordList rendered (empty during play).
    expect(screen.getByText(/no words yet/i)).toBeInTheDocument()
  })

  it('renders the OpponentStrip (Rank) in compete play', () => {
    h.result = loaded(loadedGame({ mode: 'compete' }))
    render(<PlayArea {...makeCtx({ players: twoMembers, setup: { required: 3, legal: 5, target_rank: 5, timer: { kind: 'none' } } })} />)
    expect(screen.getByText('Rank:')).toBeInTheDocument()
  })

  it('renders the terminal state and reveals unfound required words', () => {
    render(<PlayArea {...makeCtx({ isTerminal: true, playState: 'ended' })} />)
    // At terminal the WordList reveals required words nobody found — 'bead' was
    // never submitted, so it appears in the list.
    expect(screen.getByText(/bead/i)).toBeInTheDocument()
  })
})

describe('spellingbee PlayArea — submit behavior (shared useWordSubmit)', () => {
  it('accepts a required word: optimistic pill + submit_word call', async () => {
    const user = userEvent.setup()
    render(<PlayArea {...makeCtx()} />)
    await user.keyboard('bead{Enter}')
    expect(screen.getByText(/BEAD — \+1/)).toBeInTheDocument()
    expect(rpc).toHaveBeenCalledWith(
      'submit_word',
      expect.objectContaining({ word: 'bead', points: 1, is_bonus: false, is_pangram: false }),
    )
  })

  it('shows the bonus dot for a bonus word', async () => {
    const user = userEvent.setup()
    render(<PlayArea {...makeCtx()} />)
    await user.keyboard('bcdfge{Enter}')
    expect(screen.getByText(/BCDFGE • — \+6/)).toBeInTheDocument()
    expect(rpc).toHaveBeenCalledWith('submit_word', expect.objectContaining({ is_bonus: true }))
  })

  it('shows the pangram flourish for a pangram', async () => {
    const user = userEvent.setup()
    render(<PlayArea {...makeCtx()} />)
    await user.keyboard('abcdefg{Enter}')
    expect(screen.getByText(/pangram \+17/)).toBeInTheDocument()
    expect(rpc).toHaveBeenCalledWith('submit_word', expect.objectContaining({ is_pangram: true }))
  })

  it('rejects a non-legal word with a reason and no submit_word call', async () => {
    const user = userEvent.setup()
    render(<PlayArea {...makeCtx()} />)
    await user.keyboard('zzzz{Enter}') // z is not a puzzle letter
    expect(screen.getByText(/bad letters/i)).toBeInTheDocument()
    expect(rpc).not.toHaveBeenCalled()
  })

  it('names the missing center letter', async () => {
    const user = userEvent.setup()
    render(<PlayArea {...makeCtx()} />)
    await user.keyboard('bcdf{Enter}') // valid letters, but no center 'e'
    expect(screen.getByText(/missing center letter/i)).toBeInTheDocument()
    expect(rpc).not.toHaveBeenCalled()
  })
})
