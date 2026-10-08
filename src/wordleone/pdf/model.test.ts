// cs-unmet

/**
 * Tests for the wordleone print model.
 *
 * Pinned: the **target is a secret** — it must not print before it shows on
 * screen. The **board is two rows** — the starter, then the solve or a blank —
 * and the **keyboard is derived per player** from that board, so a miss earns
 * nothing and one player's solve never tints another's keys.
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
const g = (word: string, correct = false, userId = 'u1'): GEventRaw => ZTest_guess(nextId++, userId, word, correct)

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
  brand: 'WordNerdier', gameTitle: 'Board 1', date: '1 Jan 2026',
  mode: 'compete' as const, isGameEnded: false,
  wordLength: 5,
  starter: { word: 'sieve', colors: 'yxyyg' },
  events: eventsOf([]),
  players: [{ id: 'u1', username: 'me', solved: false }, { id: 'u2', username: 'moth', solved: false }],
  myId: 'u1',
  target: 'verse',
  answerShown: false,
  setupRows: [{ key: 'answer_band', label: 'Answer', value: 'NYT Wordle list' }],
}

describe('buildPrintModel — the target is a secret', () => {
  it('withholds it mid-game, even when handed it', () => {
    expect(buildPrintModel({ ...base }).target).toBeNull()
  })

  it('withholds it on a LOST game — the game having ended is not enough', () => {
    expect(buildPrintModel({ ...base, isGameEnded: true }).target).toBeNull()
  })

  it('prints it once the answer is legitimately shown (won or revealed)', () => {
    expect(buildPrintModel({ ...base, isGameEnded: true, answerShown: true }).target).toBe('VERSE')
  })
})

describe('buildPrintModel — the board', () => {
  it('prints the starter on its colors, then a blank row while unsolved', () => {
    const m = buildPrintModel({ ...base, events: eventsOf([g('crane')]) })
    const [starter, second] = m.tracks[0].rows
    expect(starter.letters).toEqual(['S', 'I', 'E', 'V', 'E'])
    expect(starter.states).toEqual(['wordleYellow', 'wordleGray', 'wordleYellow', 'wordleYellow', 'wordleGreen'])
    // A miss is not a row: the second stays blank.
    expect(second.states).toEqual(Array(5).fill('blank'))
    expect(m.tracks[0].rows).toHaveLength(2)
  })

  it('prints the solve all green in the second row', () => {
    const m = buildPrintModel({ ...base, events: eventsOf([g('verse', true)]) })
    expect(m.tracks[0].rows[1].letters).toEqual(['V', 'E', 'R', 'S', 'E'])
    expect(m.tracks[0].rows[1].states).toEqual(Array(5).fill('wordleGreen'))
  })
})

describe('buildPrintModel — the keyboard', () => {
  it('is tinted by the board, so a miss earns its letters nothing', () => {
    const m = buildPrintModel({ ...base, events: eventsOf([g('crank')]) })
    expect(m.tracks[0].keys.get('S')).toBe('wordleYellow')
    expect(m.tracks[0].keys.has('K')).toBe(false)
  })

  it('never pools one player’s solve into another’s keyboard', () => {
    const m = buildPrintModel({
      ...base,
      isGameEnded: true,
      events: eventsOf([g('verse', true, 'u1'), g('crane', false, 'u2')]),
    })
    const [mine, theirs] = m.tracks
    expect(mine.keys.get('R')).toBe('wordleGreen')
    // moth never solved — pooling would have handed them my solve.
    expect(theirs.keys.has('R')).toBe(false)
  })
})

describe('buildPrintModel — tracks', () => {
  it('coop is ONE shared track whose log names each guesser', () => {
    const m = buildPrintModel({ ...base, mode: 'coop', events: eventsOf([g('slate', false, 'u2')]) })
    expect(m.tracks).toHaveLength(1)
    expect(m.tracks[0].who).toBe('Team')
    expect(m.tracks[0].turns[0].who).toBe('moth')
    expect(m.summary).toBe('Co-op · 1 miss')
  })

  it('compete mid-game prints ONLY my board', () => {
    const m = buildPrintModel({ ...base, events: eventsOf([g('slate')]) })
    expect(m.tracks.map((t) => t.who)).toEqual(['You'])
  })

  it('compete, once the game has ended, prints one track per player', () => {
    const m = buildPrintModel({ ...base, isGameEnded: true })
    expect(m.tracks.map((t) => t.who)).toEqual(['me (you)', 'moth'])
  })

  it('reports each track’s own outcome, by its misses', () => {
    const m = buildPrintModel({
      ...base, isGameEnded: true,
      players: [{ id: 'u1', username: 'me', solved: true }, { id: 'u2', username: 'moth', solved: false }],
      events: eventsOf([g('crane'), g('verse', true)]),
    })
    expect(m.tracks[0].result).toBe('Solved, 1 miss')
    expect(m.tracks[1].result).toBe('Did not solve')
  })

  it('prints every guess, the misses included, as PLAIN words', () => {
    const m = buildPrintModel({ ...base, events: eventsOf([g('slate'), g('verse', true)]) })
    expect(m.tracks[0].turns.map((t) => t.text)).toEqual(['SLATE', 'VERSE'])
  })

  it('takes a player as the surface holds one', () => {
    // `gd.players` goes straight in: the model asks a player only for their id,
    // name and whether they solved.
    const m = buildPrintModel({ ...base, players: [ME] })
    expect(m.tracks[0].result).toBe('0 misses')
  })
})
