/**
 * Tests for the codenamesduet print model.
 *
 * The renderer is smoke-tested by `e2e/codenamesduet-print.e2e.ts`. What's
 * pinned here is the judgment, and the load-bearing item is the **peer's key**:
 * it's the secret the whole game rests on, so paper must not carry it a moment
 * before the screen does.
 */

import { describe, expect, it } from 'vitest'
import { buildDuetPrintModel } from './model'
import type { WordRow, GuessRow } from '../hooks/useBoard'
import type { ClueRow } from '../hooks/useClues'

const word = (position: number, over: Partial<WordRow> = {}): WordRow => ({
  position,
  word: `W${position}`,
  revealed_as: null,
  neutral_a: false,
  neutral_b: false,
  ...over,
})

/** 25 plain words, so a test only has to describe the ones it cares about. */
const board = (over: Record<number, Partial<WordRow>> = {}): WordRow[] =>
  Array.from({ length: 25 }, (_, i) => word(i, over[i] ?? {}))

const key = (over: Record<number, 'G' | 'N' | 'A'> = {}) =>
  Array.from({ length: 25 }, (_, i) => over[i] ?? 'N') as ('G' | 'N' | 'A')[]

const base = {
  brand: 'Duet',
  gameTitle: 'Board 1',
  date: '1 Jan 2026',
  words: board(),
  myKey: key({ 0: 'G', 1: 'A' }),
  peerKey: key({ 0: 'A', 2: 'G' }),
  mySeat: 'A' as const,
  isTerminal: false,
  clues: [] as ClueRow[],
  guesses: [] as GuessRow[],
  nameForSeat: (s: 'A' | 'B') => (s === 'A' ? 'me' : 'moth'),
  greenFound: 3,
  totalAgents: 15,
  turnNumber: 4,
  turnCap: 9,
  setup: [{ label: 'Turns', value: '9' }],
}

describe('buildDuetPrintModel — the peer key is a secret', () => {
  it('withholds it mid-game, even when handed one', () => {
    // useBoard already gates it on revealPeer; this is the second lock, so a
    // refactor there can't quietly put the partner's card on paper.
    const m = buildDuetPrintModel({ ...base })
    expect(m.showsBothKeys).toBe(false)
    expect(m.cells.every((c) => c.peer === null)).toBe(true)
  })

  it('prints it at terminal', () => {
    const m = buildDuetPrintModel({ ...base, isTerminal: true })
    expect(m.showsBothKeys).toBe(true)
    expect(m.cells[0].peer).toBe('assassin')
    expect(m.cells[2].peer).toBe('agent')
  })

  it('still shows MY key mid-game — that is the point of the printout', () => {
    const m = buildDuetPrintModel({ ...base })
    expect(m.cells[0].mine).toBe('agent')
    expect(m.cells[1].mine).toBe('assassin')
  })
})

describe('buildDuetPrintModel — what happened on a cell', () => {
  it('maps the global reveals', () => {
    const m = buildDuetPrintModel({
      ...base,
      words: board({ 0: { revealed_as: 'G' }, 1: { revealed_as: 'A' } }),
    })
    expect(m.cells[0].outcome).toBe('agent')
    expect(m.cells[1].outcome).toBe('assassin')
  })

  it('treats a bystander burned by EITHER seat as a neutral outcome', () => {
    // A neutral isn't a global reveal — it's per-seat — so the outcome is
    // derived from the two burn flags rather than revealed_as.
    const m = buildDuetPrintModel({
      ...base,
      words: board({ 3: { neutral_a: true }, 4: { neutral_b: true } }),
    })
    expect(m.cells[3].outcome).toBe('neutral')
    expect(m.cells[4].outcome).toBe('neutral')
  })

  it('leaves an untouched word with no outcome', () => {
    expect(buildDuetPrintModel({ ...base }).cells[5].outcome).toBeNull()
  })
})

describe('buildDuetPrintModel — the bystander triangles', () => {
  it('keeps mine and my partner’s apart, from MY seat', () => {
    // The asymmetry is the point: a word my partner burned is still mine to
    // guess; one I burned is locked to me. Seat A here.
    const m = buildDuetPrintModel({
      ...base,
      words: board({ 6: { neutral_a: true }, 7: { neutral_b: true } }),
    })
    expect([m.cells[6].burnedByMe, m.cells[6].burnedByPeer]).toEqual([true, false])
    expect([m.cells[7].burnedByMe, m.cells[7].burnedByPeer]).toEqual([false, true])
  })

  it('flips with the seat', () => {
    const m = buildDuetPrintModel({
      ...base,
      mySeat: 'B',
      words: board({ 6: { neutral_a: true } }),
    })
    expect([m.cells[6].burnedByMe, m.cells[6].burnedByPeer]).toEqual([false, true])
  })
})

describe('buildDuetPrintModel — the clue log', () => {
  it('reads a turn as its clue plus what the clue actually got', () => {
    const m = buildDuetPrintModel({
      ...base,
      clues: [{ id: 'c1', turn_number: 1, by_seat: 'A', word: 'ocean', count: 2 }],
      guesses: [
        { position: 0, word: 'wave', guesser_seat: 'B', result: 'G', turn_number: 1, guessed_at: '2026-01-01T00:00:02Z' },
        { position: 1, word: 'salt', guesser_seat: 'B', result: 'G', turn_number: 1, guessed_at: '2026-01-01T00:00:01Z' },
      ],
    })
    // Guesses in the order they were made, not the order they arrived.
    // ASCII arrow: jsPDF's WinAnsi core fonts have no U+2192 (it printed as `!'`).
    expect(m.turns[0].text).toBe('OCEAN 2 -> SALT, WAVE')
    expect(m.turns[0].who).toBe('me')
    expect(m.turns[0].seq).toBe(1)
  })

  it('shows a clue that got nothing as just the clue', () => {
    const m = buildDuetPrintModel({
      ...base,
      clues: [{ id: 'c1', turn_number: 1, by_seat: 'B', word: 'ocean', count: 2 }],
    })
    expect(m.turns[0].text).toBe('OCEAN 2')
    expect(m.turns[0].who).toBe('moth')
  })
})

describe('buildDuetPrintModel — summary', () => {
  it('mirrors the on-screen readout', () => {
    expect(buildDuetPrintModel({ ...base }).summary).toBe(
      '3/15 agents contacted · turn 4/9',
    )
  })
})
