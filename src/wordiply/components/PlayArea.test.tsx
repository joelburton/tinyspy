/**
 * Render + behavior tests for wordiply's PlayArea — the composition (the
 * five-row board, the length-only readout, the terminal reveal), which `tsc`
 * can't catch (a blank-page runtime error slips past it; see memory
 * project_typecheck_use_tsc_b). Deep game logic lives in pgTAP + the lib
 * Vitest suites; here we prove the tree mounts and the note-1 rules hold:
 * during play only the per-guess LENGTH shows (no score %, no letter count);
 * at terminal the score bar + longest-word reveal appear.
 *
 * `useGame` (realtime + supabase) and `db` are mocked so no client/network is
 * needed; everything else renders real.
 */
// @vitest-environment jsdom
import { render, screen } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { GamePageCtx } from '../../common/lib/games'
import { gp } from '../../common/test/gamePlayers'
import type { WordiplyGame, GuessRow } from '../hooks/useGame'
import { PlayArea } from './PlayArea'

type GameHook = { game: WordiplyGame | null; guesses: GuessRow[]; loading: boolean }

const h = vi.hoisted(() => ({ result: null as unknown as GameHook }))
vi.mock('../hooks/useGame', () => ({ useGame: () => h.result }))
vi.mock('../db', () => ({ db: { rpc: vi.fn().mockResolvedValue({ error: null }) } }))
vi.mock('../../common/lib/game/manifestRpcs', () => ({ invokeStartGameEdgeFn: vi.fn() }))

/** A loaded game on base 'ar', longest possible 'hangars' (7). */
function loadedGame(over: Partial<WordiplyGame> = {}): WordiplyGame {
  return {
    id: 'g1',
    club_handle: 'c1',
    mode: 'coop',
    base: 'ar',
    difficulty: 5,
    max_word_length: 7,
    longestWords: ['hangars'],
    legalWords: ['bar', 'car', 'cart', 'stars', 'hangars'],
    created_at: '2026-01-01T00:00:00Z',
    ...over,
  }
}

function guess(word: string, i: number, userId = 'u1'): GuessRow {
  return { id: i, game_id: 'g1', user_id: userId, word, length: word.length, guess_index: i, created_at: `2026-01-01T00:0${i}:00Z` }
}

const twoMembers = [gp('u1', 'me', 'red'), gp('u2', 'moth', 'blue')]

function makeCtx(over: Partial<GamePageCtx> = {}): GamePageCtx {
  return {
    session: { user: { id: 'u1' } } as unknown as GamePageCtx['session'],
    gameId: 'g1',
    brand: 'WordWire',
    players: [gp('u1', 'me', 'red')],
    playState: 'playing',
    isTerminal: false,
    timer: { displaySeconds: 0, expired: false },
    isMyTurn: true,
    currentTurnUserId: null,
    setup: { difficulty: 5, timer: { kind: 'none' } },
    status: null,
    globalFeedback: { show: vi.fn(), clear: vi.fn() },
    goToClub: vi.fn(),
    clubHandle: 'testclub',
    goToGame: vi.fn(),
    menu: { setGameSections: vi.fn(), openHelp: vi.fn(), requestBackToClub: vi.fn() },
    ...over,
  } as unknown as GamePageCtx
}

/** The board is the first <ol> in the DOM (BoardCol renders before InfoCol). */
function boardRowCount(container: HTMLElement): number {
  const board = container.querySelector('ol')
  return board ? board.querySelectorAll(':scope > li').length : 0
}

beforeEach(() => {
  h.result = { game: loadedGame(), guesses: [], loading: false }
})

describe('wordiply PlayArea — layout stability', () => {
  it('always renders exactly 5 guess rows (empty board)', () => {
    const { container } = render(<PlayArea {...makeCtx()} />)
    expect(boardRowCount(container)).toBe(5)
    // The base is shown plainly (no "Starter" label).
    expect(screen.getByText('AR', { exact: true })).toBeInTheDocument()
  })

  it('still renders 5 rows with some guesses landed, and a length badge per guess', () => {
    h.result = { game: loadedGame(), guesses: [guess('bar', 1), guess('stars', 2)], loading: false }
    const { container } = render(<PlayArea {...makeCtx()} />)
    expect(boardRowCount(container)).toBe(5)
    // The one live readout — each guess's length badge.
    expect(screen.getByText('3')).toBeInTheDocument() // bar
    expect(screen.getByText('5')).toBeInTheDocument() // stars
  })
})

describe('wordiply PlayArea — length-only during play', () => {
  it('shows guesses n/5 but NO score % or letter count mid-game', () => {
    h.result = { game: loadedGame(), guesses: [guess('bar', 1)], loading: false }
    render(<PlayArea {...makeCtx()} />)
    expect(screen.getByText(/guesses/i)).toBeInTheDocument()
    // The score bar's anchor ("best N / possible M") + the reveal are absent.
    expect(screen.queryByText(/possible/i)).toBeNull()
    expect(screen.queryByText(/letters across/i)).toBeNull()
  })

  it('compete OpponentStrip shows Guesses (not a score) mid-game', () => {
    h.result = { game: loadedGame({ mode: 'compete' }), guesses: [], loading: false }
    render(
      <PlayArea
        {...makeCtx({
          players: twoMembers,
          status: { leaderboard: [{ user_id: 'u1', guesses_used: 1 }, { user_id: 'u2', guesses_used: 3 }] },
        })}
      />,
    )
    expect(screen.getByText('Guesses:')).toBeInTheDocument()
  })
})

describe('wordiply PlayArea — terminal reveal', () => {
  it('reveals the score bar, letter count, and the longest possible word', () => {
    h.result = {
      game: loadedGame(),
      guesses: [guess('bar', 1), guess('stars', 2)],
      loading: false,
    }
    render(
      <PlayArea
        {...makeCtx({
          isTerminal: true,
          playState: 'ended',
          status: { outcome: 'complete', length_score: 71, letter_count: 8 },
        })}
      />,
    )
    // Score bar (longest 'stars'=5 of 7 → 71%) + its anchor now visible.
    expect(screen.getByText('71%')).toBeInTheDocument()
    expect(screen.getByText(/possible 7/)).toBeInTheDocument()
    // The reveal names the longest possible word (label carries the length).
    expect(screen.getByText(/Best possible word/)).toBeInTheDocument()
    expect(screen.getByText(/HANGARS/)).toBeInTheDocument()
  })

  it('compete terminal reveals opponents’ words but keeps my board to my own', () => {
    // I (u1) played 'bar'; my opponent moth (u2) played 'stars' + 'cart'. At
    // terminal the RLS opens moth's rows, so they arrive in `guesses`.
    h.result = {
      game: loadedGame({ mode: 'compete' }),
      guesses: [guess('bar', 1, 'u1'), guess('stars', 1, 'u2'), guess('cart', 2, 'u2')],
      loading: false,
    }
    render(
      <PlayArea
        {...makeCtx({
          players: twoMembers,
          isTerminal: true,
          playState: 'won_compete',
          status: {
            winner_user_id: 'u2',
            leaderboard: [
              { user_id: 'u2', won: true, length_score: 71 },
              { user_id: 'u1', won: false, length_score: 43 },
            ],
          },
        })}
      />,
    )
    // The opponent reveal section: moth + their two words (DimmedBaseWord
    // fragments each word across spans, so read the section's textContent).
    const section = screen.getByRole('heading', { name: /Opponents’ words/i }).closest('section')!
    expect(section.textContent).toContain('moth')
    expect(section.textContent).toContain('STARS')
    expect(section.textContent).toContain('CART')
    // Self is excluded from the reveal — my own word never appears there (it's
    // on my board instead).
    expect(section.textContent).not.toContain('BAR')
  })
})
