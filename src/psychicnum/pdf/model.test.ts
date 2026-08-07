/**
 * Tests for the psychicnum print model.
 *
 * The thing pinned: **whose marks belong on whose board.** In compete every
 * player races their own copy of the shared words, so the printout must split
 * into one track per player at terminal (own ✓/✗, own score, own log) — never
 * the merged single board the old printer produced, where one player's miss
 * printed as a mark on everyone's board. Mid-game compete prints only the
 * viewer's track (RLS hides rivals' guesses, and empty rival tracks would read
 * as "they haven't guessed").
 */
import { describe, expect, it } from 'vitest'
import { buildPsychicnumPrintModel } from './model'
import type { GuessRow } from '../hooks/useGame'

const g = (over: Partial<GuessRow> & Pick<GuessRow, 'user_id' | 'word'>): GuessRow => ({
  id: 'g1',
  is_correct: false,
  kind: 'guess',
  guessed_at: '2026-01-01T00:00:00Z',
  ...over,
})

const base = {
  brand: 'PsychicNum',
  gameTitle: 'apple-bread-crown',
  date: '1 Jan 2026',
  mode: 'compete' as const,
  isTerminal: false,
  words: ['apple', 'bread', 'crown', 'delta'],
  guesses: [] as GuessRow[],
  players: [
    { user_id: 'u1', username: 'me' },
    { user_id: 'u2', username: 'moth' },
  ],
  selfId: 'u1',
  setup: [{ key: 'guesses', label: 'Guesses', value: '7' }],
}

describe('buildPsychicnumPrintModel — compete splits per player', () => {
  const guesses = [
    g({ user_id: 'u1', word: 'apple', is_correct: true }),
    g({ user_id: 'u2', word: 'bread', is_correct: false }),
    g({ user_id: 'u2', word: 'crown', is_correct: true }),
  ]

  it('at terminal: one track per player, each with only their own marks', () => {
    const m = buildPsychicnumPrintModel({ ...base, isTerminal: true, guesses })
    expect(m.tracks.map((t) => t.who)).toEqual(['me (you)', 'moth'])

    const [mine, theirs] = m.tracks
    // My board carries MY guess only — the rival's miss/hit must not mark it.
    expect(mine.board.map((t) => t.state)).toEqual(['correct', 'undecided', 'undecided', 'undecided'])
    expect(theirs.board.map((t) => t.state)).toEqual(['undecided', 'miss', 'correct', 'undecided'])
    // Scores are per player too.
    expect(mine.result).toBe('1 of 3 secrets found · 1 guess used')
    expect(theirs.result).toBe('1 of 3 secrets found · 2 guesses used')
    // And each log holds only that player's rows.
    expect(mine.turns.map((t) => t.text)).toEqual(['APPLE — Correct'])
    expect(theirs.turns.map((t) => t.text)).toEqual(['BREAD — Incorrect', 'CROWN — Correct'])
  })

  it('mid-game: only the viewer\'s track (rivals\' guesses are hidden)', () => {
    const m = buildPsychicnumPrintModel({ ...base, guesses: guesses.filter((x) => x.user_id === 'u1') })
    expect(m.tracks.map((t) => t.who)).toEqual(['You'])
    expect(m.tracks[0].board.map((t) => t.state)).toEqual(['correct', 'undecided', 'undecided', 'undecided'])
  })

  it('routes a hint row to its requester\'s track with the log wording', () => {
    const m = buildPsychicnumPrintModel({
      ...base,
      isTerminal: true,
      guesses: [...guesses, g({ user_id: 'u2', word: 'starts with d', kind: 'hint' })],
    })
    expect(m.tracks[1].turns.at(-1)?.text).toBe('Hint: starts with d')
    // A hint is not a guess: it must not touch the board or the used-count.
    expect(m.tracks[1].result).toBe('1 of 3 secrets found · 2 guesses used')
  })
})

describe('buildPsychicnumPrintModel — coop stays one shared track', () => {
  it('merges everyone onto one board and names each guesser in the log', () => {
    const m = buildPsychicnumPrintModel({
      ...base,
      mode: 'coop',
      guesses: [
        g({ user_id: 'u1', word: 'apple', is_correct: true }),
        g({ user_id: 'u2', word: 'bread', is_correct: false }),
      ],
    })
    expect(m.tracks).toHaveLength(1)
    const t = m.tracks[0]
    expect(t.who).toBe('Team')
    expect(t.board.map((x) => x.state)).toEqual(['correct', 'miss', 'undecided', 'undecided'])
    expect(t.turns.map((x) => x.who)).toEqual(['me', 'moth'])
    // The coop header carries the team score, as the old single-board page did.
    expect(m.summary).toBe('Co-op · 1 of 3 secrets found · 2 guesses used')
  })
})
