/**
 * Tests for strands' print model — the pure half.
 *
 * The judgment under test is **what may be printed**. strands hides its answer,
 * so paper must not reveal what the screen withholds: no missed words before the
 * reveal, and no rival's board before the game is over. The rest (glyphs,
 * summaries) is formatting, and gets one case each.
 */
import { describe, expect, it } from 'vitest'
import { buildPrintModel } from './model'
import type { EventRow, GuessResult, StrandsPlayer, StrandsSolution } from '../hooks/useGame'
import type { Member } from '../../common/lib/games'

const ADA = 'ada'
const BEA = 'bea'
const players = [
  { user_id: ADA, username: 'ada', color: 'red' },
  { user_id: BEA, username: 'bea', color: 'blue' },
] as unknown as Member[]

const state = (user_id: string, hints_spent: number): StrandsPlayer => ({
  game_id: 'g', user_id, hints_spent, solved: false, solved_at: null,
  hint_points: 0, active_hint_coords: null,
})

let n = 0
const guess = (user_id: string, word: string, result: GuessResult): EventRow => ({
  kind: 'guess',
  id: `g${n++}`, game_id: 'g', user_id, word, path: [[0, 0], [0, 1]],
  result, created_at: '2026-01-01',
})

/** A spent hint — no word, no verdict, but coords like every other row. */
const hint = (user_id: string): EventRow => ({
  kind: 'hint',
  id: `g${n++}`, game_id: 'g', user_id, word: null, path: [[7, 0], [7, 1]],
  result: null, created_at: '2026-01-01',
})

const SOLUTION: StrandsSolution = {
  spangram: { word: 'SPAN', coords: [[4, 0], [4, 1]] },
  themeWords: [
    { word: 'FOUND', coords: [[0, 0], [0, 1]] },
    { word: 'MISSED', coords: [[7, 0], [7, 1]] },
  ],
}

const base = {
  header: { mode: 'coop' as const, brand: 'PaulPath', gameTitle: 't', date: 'd', summary: 's', setup: [] },
  board: ['ABCDEF', 'ABCDEF', 'ABCDEF', 'ABCDEF', 'ABCDEF', 'ABCDEF', 'ABCDEF', 'ABCDEF'],
  players,
  selfId: ADA,
}

describe('buildPrintModel — the shield holds on paper', () => {
  it('prints NO missed words while the solution is hidden', () => {
    const m = buildPrintModel({
      ...base, mode: 'coop', isTerminal: false,
      events: [guess(ADA, 'FOUND', 'theme')],
      playerStates: [state(ADA, 0)],
      solution: null,
    })
    expect(m.tracks[0].words.map((w) => w.word)).toEqual(['FOUND'])
    expect(m.tracks[0].words.some((w) => w.missed)).toBe(false)
  })

  it('prints the missed words once the solution is revealed', () => {
    const m = buildPrintModel({
      ...base, mode: 'coop', isTerminal: true,
      events: [guess(ADA, 'FOUND', 'theme')],
      playerStates: [state(ADA, 0)],
      solution: SOLUTION,
    })
    const missed = m.tracks[0].words.filter((w) => w.missed).map((w) => w.word)
    expect(missed.sort()).toEqual(['MISSED', 'SPAN'])
  })

  it('compete prints ONLY the caller\'s track mid-game', () => {
    // Not a display choice: RLS hasn't handed over anyone else's guesses, so a
    // rival's column would be an empty grid claiming they'd found nothing.
    const m = buildPrintModel({
      ...base, mode: 'compete', isTerminal: false,
      events: [guess(ADA, 'FOUND', 'theme')],
      playerStates: [state(ADA, 1), state(BEA, 0)],
      solution: null,
    })
    expect(m.tracks).toHaveLength(1)
    expect(m.tracks[0].who).toBe('ada')
  })

  it('compete prints EVERY player at terminal, each with their own words', () => {
    const m = buildPrintModel({
      ...base, mode: 'compete', isTerminal: true,
      events: [guess(ADA, 'FOUND', 'theme'), guess(BEA, 'SPAN', 'spangram')],
      playerStates: [state(ADA, 1), state(BEA, 0)],
      solution: SOLUTION,
    })
    expect(m.tracks.map((t) => t.who)).toEqual(['ada', 'bea'])
    // Each column holds that player's OWN find — the whole reason compete
    // prints in tracks rather than one merged log.
    expect(m.tracks[0].words.filter((w) => !w.missed).map((w) => w.word)).toEqual(['FOUND'])
    expect(m.tracks[1].words.filter((w) => !w.missed).map((w) => w.word)).toEqual(['SPAN'])
  })
})

describe('buildPrintModel — formatting', () => {
  it('coop is ONE unnamed track: the board is the team\'s', () => {
    const m = buildPrintModel({
      ...base, mode: 'coop', isTerminal: false,
      events: [guess(ADA, 'FOUND', 'theme'), guess(BEA, 'ADAPT', 'hint_word')],
      playerStates: [state(ADA, 2), state(BEA, 2)],
      solution: null,
    })
    expect(m.tracks).toHaveLength(1)
    expect(m.tracks[0].who).toBeNull()
    // Both players' rows, because the log is the team's too.
    expect(m.tracks[0].turns).toHaveLength(2)
    // The shared pool means any row's spend IS the team's.
    expect(m.tracks[0].summary).toBe('1 word · 2 hints')
  })

  it('marks each verdict, and notes only what the glyph cannot say', () => {
    const m = buildPrintModel({
      ...base, mode: 'coop', isTerminal: false,
      events: [
        guess(ADA, 'SPAN', 'spangram'),
        guess(ADA, 'FOUND', 'theme'),
        guess(ADA, 'ADAPT', 'hint_word'),
        guess(ADA, 'ZZ', 'too_short'),
      ],
      playerStates: [state(ADA, 0)],
      solution: null,
    })
    expect(m.tracks[0].turns.map((t) => [t.mark, t.note])).toEqual([
      ['best', ''],
      ['find', ''],
      ['ok', ''],
      // Every rejection shares one glyph, so the note is the only thing saying
      // WHICH rejection it was.
      ['no', 'too short'],
    ])
  })

  it('omits the hint count when none were spent', () => {
    const m = buildPrintModel({
      ...base, mode: 'coop', isTerminal: false,
      events: [guess(ADA, 'FOUND', 'theme')],
      playerStates: [state(ADA, 0)],
      solution: null,
    })
    expect(m.tracks[0].summary).toBe('1 word')
  })

  it('prints a spent hint as its own row, in sequence, with no word', () => {
    const m = buildPrintModel({
      ...base, mode: 'coop', isTerminal: false,
      events: [guess(ADA, 'FOUND', 'theme'), hint(ADA), guess(ADA, 'SPAN', 'spangram')],
      playerStates: [state(ADA, 1)],
      solution: null,
    })
    // Position matters: the printed log keeps the same numbering as the screen,
    // so the two can be read side by side.
    expect(m.tracks[0].turns.map((t) => [t.seq, t.word, t.mark])).toEqual([
      [1, 'FOUND', 'find'],
      [2, 'Hint used', 'hint'],
      [3, 'SPAN', 'best'],
    ])
  })

  it('a hint never reaches the printed BOARD — it revealed, it did not place', () => {
    const m = buildPrintModel({
      ...base, mode: 'coop', isTerminal: false,
      events: [guess(ADA, 'FOUND', 'theme'), hint(ADA)],
      playerStates: [state(ADA, 1)],
      solution: null,
    })
    // The hint's coords are a theme word's cells; drawing them among the found
    // words would print an answer nobody found — the shield's whole concern.
    expect(m.tracks[0].words.map((w) => w.word)).toEqual(['FOUND'])
    expect(m.tracks[0].summary).toBe('1 word · 1 hint')
  })
})
