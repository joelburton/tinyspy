/**
 * Tests for the wordle print model.
 *
 * Two things are pinned. The **target is a secret** — it must not print before
 * the game ends, exactly as it doesn't show on screen. And the **keyboard is
 * derived per player**: it's the best state seen for each letter across THAT
 * player's guesses, so once compete prints everyone's board it would be easy to
 * build one keyboard from the pooled guesses and hand every player everyone
 * else's deductions.
 */
import { describe, expect, it } from 'vitest'
import { buildWordlePrintModel } from './model'
import type { GuessRow } from '../hooks/useGame'

const g = (over: Partial<GuessRow> & Pick<GuessRow, 'guess' | 'colors'>): GuessRow => ({
  user_id: 'u1', seq: 1, is_correct: false, ...over,
})

const base = {
  brand: 'Wordle', gameTitle: 'Board 1', date: '1 Jan 2026',
  mode: 'compete' as const, isTerminal: false,
  maxGuesses: 6, wordLength: 5,
  guesses: [] as GuessRow[],
  players: [{ user_id: 'u1', username: 'me' }, { user_id: 'u2', username: 'moth' }],
  selfId: 'u1',
  target: 'crane',
  answerShown: false,
  solvedBy: new Set<string>(),
  setup: [{ key: 'guesses', label: 'Guesses', value: '6' }],
}

describe('buildWordlePrintModel — the target is a secret', () => {
  it('withholds it mid-game, even when handed it', () => {
    expect(buildWordlePrintModel({ ...base }).target).toBeNull()
  })

  it('withholds it on a LOST game — terminal is not enough', () => {
    // wordle hides the answer on a loss so Restart is a real second try; a
    // printout spelling it out would undo that from the outside. (This is the
    // bug that shipped: the gate was `isTerminal`.)
    expect(buildWordlePrintModel({ ...base, isTerminal: true }).target).toBeNull()
  })

  it('prints it once the answer is legitimately shown (won or revealed)', () => {
    expect(
      buildWordlePrintModel({ ...base, isTerminal: true, answerShown: true }).target,
    ).toBe('CRANE')
  })
})

describe('buildWordlePrintModel — the board', () => {
  it('maps the server colour codes to tile states', () => {
    const m = buildWordlePrintModel({ ...base, guesses: [g({ guess: 'slate', colors: 'xgyxg' })] })
    expect(m.tracks[0].rows[0].states).toEqual(['gray', 'green', 'yellow', 'gray', 'green'])
    expect(m.tracks[0].rows[0].letters).toEqual(['S', 'L', 'A', 'T', 'E'])
  })

  it('pads to the full board height so tracks compare at a glance', () => {
    const m = buildWordlePrintModel({ ...base, guesses: [g({ guess: 'slate', colors: 'xxxxx' })] })
    expect(m.tracks[0].rows).toHaveLength(6)
    // The unplayed rows are blank — a state that draws no box at all.
    expect(m.tracks[0].rows[5].states).toEqual(Array(5).fill('blank'))
  })
})

describe('buildWordlePrintModel — the keyboard', () => {
  it('keeps the BEST state seen for a letter, like the on-screen one', () => {
    const m = buildWordlePrintModel({
      ...base,
      guesses: [g({ guess: 'aaaaa', colors: 'xxxxx' }), g({ guess: 'aaaaa', colors: 'gxxxx' })],
    })
    // Grey then green → green wins (colorRank), not "last one seen".
    expect(m.tracks[0].keys.get('A')).toBe('green')
  })

  it('never pools one player’s letters into another’s keyboard', () => {
    const m = buildWordlePrintModel({
      ...base,
      isTerminal: true,
      guesses: [
        g({ user_id: 'u1', guess: 'slate', colors: 'ggggg' }),
        g({ user_id: 'u2', guess: 'crane', colors: 'xxxxx' }),
      ],
    })
    const [mine, theirs] = m.tracks
    expect(mine.keys.get('S')).toBe('green')
    // moth never played S — pooling would have handed them my deduction.
    expect(theirs.keys.has('S')).toBe(false)
  })
})

describe('buildWordlePrintModel — tracks', () => {
  it('coop is ONE shared track whose log names each guesser', () => {
    const m = buildWordlePrintModel({
      ...base,
      mode: 'coop',
      guesses: [g({ user_id: 'u2', guess: 'slate', colors: 'xxxxx' })],
    })
    expect(m.tracks).toHaveLength(1)
    expect(m.tracks[0].who).toBe('Team')
    expect(m.tracks[0].turns[0].who).toBe('moth')
  })

  it('compete mid-game prints ONLY my board', () => {
    const m = buildWordlePrintModel({ ...base, guesses: [g({ guess: 'slate', colors: 'xxxxx' })] })
    expect(m.tracks.map((t) => t.who)).toEqual(['You'])
  })

  it('compete at terminal prints one track per player', () => {
    const m = buildWordlePrintModel({ ...base, isTerminal: true })
    expect(m.tracks.map((t) => t.who)).toEqual(['me (you)', 'moth'])
  })

  it('reports each track’s own outcome', () => {
    const m = buildWordlePrintModel({
      ...base, isTerminal: true, solvedBy: new Set(['u1']),
      guesses: [g({ guess: 'crane', colors: 'ggggg' })],
    })
    expect(m.tracks[0].result).toBe('Solved in 1')
    expect(m.tracks[1].result).toBe('Did not solve')
  })

  it('prints guesses as PLAIN words — the grid already carries the colours', () => {
    const m = buildWordlePrintModel({ ...base, guesses: [g({ guess: 'slate', colors: 'xgyxg' })] })
    expect(m.tracks[0].turns[0].text).toBe('SLATE')
  })
})
