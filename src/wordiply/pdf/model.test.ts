/**
 * Tests for the wordiply print model.
 *
 * The renderer is smoke-tested end to end by `e2e/wordiply-print.e2e.ts` (jsPDF's
 * runtime is unreachable from a mocked component test). What's worth pinning
 * HERE is the judgment the model makes, and above all the one rule a careless
 * `status` dump would break: wordiply withholds the length score, the letter
 * count and the longest possible word until terminal, and a printout is just
 * another view of the same game — so paper has to withhold them too.
 */

import { describe, expect, it } from 'vitest'
import { buildWordiplyPrintModel } from './model'
import type { GuessRow } from '../hooks/useGame'

const row = (over: Partial<GuessRow> & { word: string }): GuessRow => ({
  id: 1,
  game_id: 'g1',
  user_id: 'u1',
  length: over.word.length,
  valid: true,
  reason: null,
  seq: 1,
  guessed_at: '2026-01-01T00:00:00Z',
  ...over,
})

const base = {
  brand: 'WordWire',
  gameTitle: 'AR',
  date: '1 Jan 2026',
  base: 'ar',
  maxWordLength: 9,
  longestWord: 'hangaring',
  mode: 'coop' as const,
  isTerminal: false,
  solutionRevealed: false,
  guesses: [] as GuessRow[],
  players: [
    { user_id: 'u1', username: 'me' },
    { user_id: 'u2', username: 'moth' },
  ],
  selfId: 'u1',
  guessesUsed: 0,
  maxGuesses: 5,
  lengthScore: 0,
  letterCount: 0,
  leaderboard: [] as { user_id: string; length_score?: number; letter_count?: number; won?: boolean }[],
  setup: [{ key: 'dictionary', label: 'Dictionary', value: 'Standard' }],
}

describe('buildWordiplyPrintModel — the terminal-only rule', () => {
  it('withholds scores and the longest word MID-GAME', () => {
    const m = buildWordiplyPrintModel({
      ...base,
      guessesUsed: 2,
      // Even when the caller hands over real numbers, they must not print.
      lengthScore: 78,
      letterCount: 11,
    })
    expect(m.summary).toBe('Starter AR · 2 / 5 guesses')
    expect(m.summary).not.toMatch(/78|letters/)
    expect(m.reveal).toBeNull()
    expect(m.scores).toEqual([])
  })

  it('reveals scores and the longest word at TERMINAL', () => {
    const m = buildWordiplyPrintModel({
      ...base,
      isTerminal: true,
      // wordiply never hides its answer, so end_game sets the common flag at
      // every ending — the printout reads it, not `isTerminal`.
      solutionRevealed: true,
      guessesUsed: 5,
      lengthScore: 78,
      letterCount: 24,
    })
    expect(m.summary).toBe('Starter AR · Length score 78% · 24 letters across 5 guesses')
    expect(m.reveal).toEqual({ word: 'HANGARING', length: 9 })
  })

  it('says "1 guess", not "1 guesses"', () => {
    const m = buildWordiplyPrintModel({ ...base, isTerminal: true, guessesUsed: 1 })
    expect(m.summary).toContain('across 1 guess')
    expect(m.summary).not.toContain('1 guesses')
  })
})

describe('buildWordiplyPrintModel — the turn log', () => {
  it('prints rejects alongside accepted guesses, each with its reason', () => {
    const m = buildWordiplyPrintModel({
      ...base,
      guesses: [
        row({ word: 'hangars', id: 1 }),
        row({ word: 'arqqq', id: 2, valid: false, reason: 'not_a_word', seq: null }),
        row({ word: 'zzzz', id: 3, valid: false, reason: 'missing_base', seq: null }),
        row({ word: 'ar', id: 4, valid: false, reason: 'too_short', seq: null }),
      ],
    })
    expect(m.turns.map((t) => t.text)).toEqual([
      'HANGARS (7)',
      'ARQQQ — not a word',
      'ZZZZ — no base',
      'AR — too short',
    ])
  })

  it('numbers by LOG POSITION, not seq (rejects have none)', () => {
    const m = buildWordiplyPrintModel({
      ...base,
      guesses: [
        row({ word: 'hangars', id: 1, seq: 1 }),
        row({ word: 'arqqq', id: 2, valid: false, reason: 'not_a_word', seq: null }),
        // Board row 2 — but the third thing that happened.
        row({ word: 'arcs', id: 3, seq: 2 }),
      ],
    })
    expect(m.turns.map((t) => t.seq)).toEqual([1, 2, 3])
  })

  it('names the guesser on every row', () => {
    const m = buildWordiplyPrintModel({
      ...base,
      guesses: [row({ word: 'arcs', id: 1 }), row({ word: 'arbs', id: 2, user_id: 'u2' })],
    })
    expect(m.turns.map((t) => t.who)).toEqual(['me', 'moth'])
  })
})

describe('buildWordiplyPrintModel — compete', () => {
  const competeGuesses = [
    row({ word: 'arcs', id: 1, user_id: 'u2', guessed_at: '2026-01-01T00:00:01Z' }),
    row({ word: 'arbs', id: 2, user_id: 'u1', guessed_at: '2026-01-01T00:00:02Z' }),
    row({ word: 'arts', id: 3, user_id: 'u2', guessed_at: '2026-01-01T00:00:03Z' }),
    row({ word: 'army', id: 4, user_id: 'u1', guessed_at: '2026-01-01T00:00:04Z' }),
  ]

  it('groups the log by player (self first), not chronologically', () => {
    // Compete tracks are PARALLEL races — interleaving them by time reads as
    // nonsense, so each player's run stays a contiguous block.
    const m = buildWordiplyPrintModel({ ...base, mode: 'compete', guesses: competeGuesses })
    expect(m.turns.map((t) => t.who)).toEqual(['me', 'me', 'moth', 'moth'])
    // …and within a player, still in play order.
    expect(m.turns.map((t) => t.text)).toEqual([
      'ARBS (4)',
      'ARMY (4)',
      'ARCS (4)',
      'ARTS (4)',
    ])
  })

  it('keeps coop in play order (one shared sequence)', () => {
    const m = buildWordiplyPrintModel({ ...base, guesses: competeGuesses })
    expect(m.turns.map((t) => t.who)).toEqual(['moth', 'me', 'moth', 'me'])
  })

  it('builds the per-player scores block at terminal, marking the winner', () => {
    const m = buildWordiplyPrintModel({
      ...base,
      mode: 'compete',
      isTerminal: true,
      leaderboard: [
        { user_id: 'u1', length_score: 44, letter_count: 16 },
        { user_id: 'u2', length_score: 78, letter_count: 20, won: true },
      ],
    })
    expect(m.scores).toEqual([
      { who: 'me', lengthScore: 44, letterCount: 16, won: false },
      { who: 'moth', lengthScore: 78, letterCount: 20, won: true },
    ])
  })

  it('shows a player with no leaderboard row as zeroes rather than dropping them', () => {
    const m = buildWordiplyPrintModel({
      ...base,
      mode: 'compete',
      isTerminal: true,
      leaderboard: [{ user_id: 'u1', length_score: 44, letter_count: 16 }],
    })
    expect(m.scores.map((s) => s.who)).toEqual(['me', 'moth'])
    expect(m.scores[1]).toEqual({ who: 'moth', lengthScore: 0, letterCount: 0, won: false })
  })

  it('has no scores block in coop (the header summary carries the one result)', () => {
    const m = buildWordiplyPrintModel({ ...base, isTerminal: true, leaderboard: [] })
    expect(m.scores).toEqual([])
  })
})
