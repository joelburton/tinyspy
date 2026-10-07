// cs-blessed-psychicnum

/**
 * Tests for the psychicnum print model.
 *
 * The thing pinned: **whose marks belong on whose board.** In compete every
 * player races their own copy of the shared words, so the printout splits into
 * one track per player once the game has ended — own ✓/✗, own score, own log. Merge them
 * onto a single board and one player's miss prints as a mark on everyone's.
 * Mid-game compete prints only the viewer's track: `gd.events` holds only the
 * viewer's rows then, and empty rival tracks would read as "they haven't
 * guessed".
 */
import { describe, expect, it } from 'vitest'
import { buildPrintModel } from './model'
import { ZTest_guess, ZTest_makeGameDataRaw } from '../lib/gameData.fixture'
import { makeGameData } from '../hooks/useGame'

const ME = { id: 'u1', username: 'me', color: 'red' }
const MOTH = { id: 'u2', username: 'moth', color: 'blue' }
const WORDS = ['apple', 'bread', 'crown', 'delta']

/** The rows of a finished game, each with its player, as `gd` holds them. */
function eventsOf(mode: 'coop' | 'compete', rows: ReturnType<typeof ZTest_guess>[]) {
  return makeGameData(
    ZTest_makeGameDataRaw({
      mode,
      words: WORDS,
      players: [ME, MOTH],
      events: rows,
      ending: { reason: 'stopped', detail: 'stopped', by: 'u1' },
      outcome: 'neutral',
    }),
    'u1',
  ).events
}

const base = {
  brand: 'PsychicNum',
  gameTitle: 'apple-bread-crown',
  date: '1 Jan 2026',
  mode: 'compete' as const,
  isGameEnded: false,
  words: WORDS,
  events: [] as ReturnType<typeof eventsOf>,
  nReqdSecrets: 3,
  players: [ME, MOTH],
  myId: 'u1',
  setupRows: [{ key: 'max_guesses', label: 'Guesses', value: '7' }],
}

describe('buildPrintModel — compete splits per player', () => {
  const events = eventsOf('compete', [
    ZTest_guess(1, 'u1', 'apple', true),
    ZTest_guess(2, 'u2', 'bread', false),
    ZTest_guess(3, 'u2', 'crown', true),
  ])

  it('once the game has ended: one track per player, each with only their own marks', () => {
    const m = buildPrintModel({ ...base, isGameEnded: true, events })
    expect(m.tracks.map((t) => t.who)).toEqual(['me (you)', 'moth'])

    const [mine, theirs] = m.tracks
    // My board carries MY guess only — the rival's miss/hit must not mark it.
    expect(mine!.board.map((t) => t.state)).toEqual(['correct', 'undecided', 'undecided', 'undecided'])
    expect(theirs!.board.map((t) => t.state)).toEqual(['undecided', 'miss', 'correct', 'undecided'])
    // Scores are per player too.
    expect(mine!.result).toBe('1 of 3 secrets found · 1 guess used')
    expect(theirs!.result).toBe('1 of 3 secrets found · 2 guesses used')
    // And each log holds only that player's rows.
    expect(mine!.turns.map((t) => t.text)).toEqual(['APPLE — Correct'])
    expect(theirs!.turns.map((t) => t.text)).toEqual(['BREAD — Wrong', 'CROWN — Correct'])
  })

  it('mid-game: only the viewer\'s track (a rival\'s rows are withheld)', () => {
    const m = buildPrintModel({ ...base, events: events.filter((event) => event.by.id === 'u1') })
    expect(m.tracks.map((t) => t.who)).toEqual(['You'])
    expect(m.tracks[0]!.board.map((t) => t.state)).toEqual(['correct', 'undecided', 'undecided', 'undecided'])
  })

  it('routes a hint row to its requester\'s track with the log wording', () => {
    const m = buildPrintModel({
      ...base,
      isGameEnded: true,
      events: eventsOf('compete', [
        ZTest_guess(1, 'u1', 'apple', true),
        ZTest_guess(2, 'u2', 'bread', false),
        ZTest_guess(3, 'u2', 'crown', true),
        ZTest_guess(4, 'u2', 'starts with d', false, { kind: 'hint' }),
      ]),
    })
    expect(m.tracks[1]!.turns.at(-1)?.text).toBe('Hint: starts with d')
    // A hint is not a guess: it must not touch the board or the used-count.
    expect(m.tracks[1]!.result).toBe('1 of 3 secrets found · 2 guesses used')
  })
})

describe('buildPrintModel — coop stays one shared track', () => {
  it('merges everyone onto one board and names each guesser in the log', () => {
    const m = buildPrintModel({
      ...base,
      mode: 'coop',
      events: eventsOf('coop', [ZTest_guess(1, 'u1', 'apple', true), ZTest_guess(2, 'u2', 'bread', false)]),
    })
    expect(m.tracks).toHaveLength(1)
    const t = m.tracks[0]!
    expect(t.who).toBe('Team')
    expect(t.board.map((x) => x.state)).toEqual(['correct', 'miss', 'undecided', 'undecided'])
    expect(t.turns.map((x) => x.who)).toEqual(['me', 'moth'])
    // The coop header carries the TEAM score: one board, one tally.
    expect(m.summary).toBe('Co-op · 1 of 3 secrets found · 2 guesses used')
  })
})
