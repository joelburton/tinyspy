// cs-blessed-wordle

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
import { makeGameData } from '../hooks/useGame'
import { ZTest_guess, ZTest_makeGameDataRaw } from '../lib/gameData.fixture'
import type { GEventRaw, GPlayer } from '../types'
import { buildPrintModel } from './model'

const ME: GPlayer = makeGameData(ZTest_makeGameDataRaw(), 'u1').me

const TWO = [
  { id: 'u1', username: 'me', color: 'red' },
  { id: 'u2', username: 'moth', color: 'blue' },
]

/** A guess row by me unless said otherwise; ids count up. */
let nextId = 1
const g = (over: Partial<GEventRaw> & Pick<GEventRaw, 'word' | 'colors'>): GEventRaw => ({
  ...ZTest_guess(nextId++, 'u1', over.word, over.colors),
  ...over,
})

/** The log as `gd` holds it, by player. Built from an ENDED compete game so
 *  every player's rows are in it, whatever the model is then told about the
 *  game. */
const eventsOf = (events: GEventRaw[]) =>
  makeGameData(
    ZTest_makeGameDataRaw({
      mode: 'compete',
      players: TWO,
      events,
      ending: { reason: 'stopped', detail: 'stopped', by: 'u1' },
      outcome: 'neutral',
    }),
    'u1',
  ).events

const base = {
  brand: 'Wordle', gameTitle: 'Board 1', date: '1 Jan 2026',
  mode: 'compete' as const, isGameEnded: false,
  maxGuesses: 6, wordLength: 5,
  events: eventsOf([]),
  players: [{ id: 'u1', username: 'me', solved: false }, { id: 'u2', username: 'moth', solved: false }],
  myId: 'u1',
  target: 'crane',
  answerShown: false,
  setupRows: [{ key: 'guesses', label: 'Guesses', value: '6' }],
}

describe('buildPrintModel — the target is a secret', () => {
  it('withholds it mid-game, even when handed it', () => {
    expect(buildPrintModel({ ...base }).target).toBeNull()
  })

  it('withholds it on a LOST game — the game having ended is not enough', () => {
    // wordle hides the answer on a loss so Restart is a real second try; a
    // printout spelling it out would undo that from the outside. (This is the
    // bug that shipped: the gate was whether the game had ended.)
    expect(buildPrintModel({ ...base, isGameEnded: true }).target).toBeNull()
  })

  it('prints it once the answer is legitimately shown (won or revealed)', () => {
    expect(
      buildPrintModel({ ...base, isGameEnded: true, answerShown: true }).target,
    ).toBe('CRANE')
  })
})

describe('buildPrintModel — the board', () => {
  it('maps the server color codes to tile states', () => {
    const m = buildPrintModel({ ...base, events: eventsOf([g({ word: 'slate', colors: 'xgyxg' })]) })
    expect(m.tracks[0].rows[0].states).toEqual(
      ['wordleGray', 'wordleGreen', 'wordleYellow', 'wordleGray', 'wordleGreen'],
    )
    expect(m.tracks[0].rows[0].letters).toEqual(['S', 'L', 'A', 'T', 'E'])
  })

  it('pads to the full board height so tracks compare at a glance', () => {
    const m = buildPrintModel({ ...base, events: eventsOf([g({ word: 'slate', colors: 'xxxxx' })]) })
    expect(m.tracks[0].rows).toHaveLength(6)
    // The unplayed rows are blank — a state that draws no box at all.
    expect(m.tracks[0].rows[5].states).toEqual(Array(5).fill('blank'))
  })
})

describe('buildPrintModel — the keyboard', () => {
  it('keeps the BEST state seen for a letter, like the on-screen one', () => {
    const m = buildPrintModel({
      ...base,
      events: eventsOf([g({ word: 'aaaaa', colors: 'xxxxx' }), g({ word: 'aaaaa', colors: 'gxxxx' })]),
    })
    // Gray then green → green wins (colorRank), not "last one seen".
    expect(m.tracks[0].keys.get('A')).toBe('wordleGreen')
  })

  it('never pools one player’s letters into another’s keyboard', () => {
    const m = buildPrintModel({
      ...base,
      isGameEnded: true,
      events: eventsOf([
        g({ userId: 'u1', word: 'slate', colors: 'ggggg' }),
        g({ userId: 'u2', word: 'crane', colors: 'xxxxx' }),
      ]),
    })
    const [mine, theirs] = m.tracks
    expect(mine.keys.get('S')).toBe('wordleGreen')
    // moth never played S — pooling would have handed them my deduction.
    expect(theirs.keys.has('S')).toBe(false)
  })
})

describe('buildPrintModel — tracks', () => {
  it('coop is ONE shared track whose log names each guesser', () => {
    const m = buildPrintModel({
      ...base,
      mode: 'coop',
      events: eventsOf([g({ userId: 'u2', word: 'slate', colors: 'xxxxx' })]),
    })
    expect(m.tracks).toHaveLength(1)
    expect(m.tracks[0].who).toBe('Team')
    expect(m.tracks[0].turns[0].who).toBe('moth')
  })

  it('compete mid-game prints ONLY my board', () => {
    const m = buildPrintModel({ ...base, events: eventsOf([g({ word: 'slate', colors: 'xxxxx' })]) })
    expect(m.tracks.map((t) => t.who)).toEqual(['You'])
  })

  it('compete, once the game has ended, prints one track per player', () => {
    const m = buildPrintModel({ ...base, isGameEnded: true })
    expect(m.tracks.map((t) => t.who)).toEqual(['me (you)', 'moth'])
  })

  it('reports each track’s own outcome', () => {
    const m = buildPrintModel({
      ...base, isGameEnded: true,
      players: [{ id: 'u1', username: 'me', solved: true }, { id: 'u2', username: 'moth', solved: false }],
      events: eventsOf([g({ word: 'crane', colors: 'ggggg' })]),
    })
    expect(m.tracks[0].result).toBe('Solved in 1')
    expect(m.tracks[1].result).toBe('Did not solve')
  })

  it('prints guesses as PLAIN words — the grid already carries the colors', () => {
    const m = buildPrintModel({ ...base, events: eventsOf([g({ word: 'slate', colors: 'xgyxg' })]) })
    expect(m.tracks[0].turns[0].text).toBe('SLATE')
  })

  it('takes a player as the surface holds one', () => {
    // `gd.players` goes straight in: the model asks a player only for their id,
    // name and whether they solved.
    const m = buildPrintModel({ ...base, players: [ME] })
    expect(m.tracks[0].result).toBe('0/6 guesses')
  })
})
