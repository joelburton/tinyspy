// cs-met-codenamesduet

/**
 * `lib/events.ts` — the one place a `codenamesduet.events` row, every payload
 * column nullable, becomes a typed event:
 *
 *   1. each kind keeps exactly its own payload and drops the other kinds' nulls;
 *   2. a row missing its own payload is a BUG and throws, rather than drawing;
 *   3. `cluesOf` / `guessesOf` keep the table's order, and a guess gets the word
 *      on its tile.
 */
import { describe, expect, it } from 'vitest'
import { cluesOf, guessesOf, toDuetEvent, type EventsRow } from './events'

/** A row as the table hands it back — every payload column present, nulls
 *  where the kind has none. */
const row = (over: Partial<EventsRow>): EventsRow => ({
  id: 1, user_id: 'u', kind: 'pass', took_turn: false, created_at: 't',
  turn_number: 1, seat: 'A',
  clue_word: null, clue_count: null, clue_from_ai: null, guess_position: null, guess_result: null,
  ...over,
})

const BASE = { id: 1, user_id: 'u', took_turn: false, created_at: 't', turn_number: 1, seat: 'A' }

describe('toDuetEvent', () => {
  it('keeps a clue\'s word, count and provenance, and nothing of a guess', () => {
    expect(toDuetEvent(row({ kind: 'clue', clue_word: 'TOOLS', clue_count: 2, clue_from_ai: true })))
      .toEqual({ ...BASE, kind: 'clue', clue_word: 'TOOLS', clue_count: 2, clue_from_ai: true })
  })

  it('keeps a guess\'s tile and label, and nothing of a clue', () => {
    expect(toDuetEvent(row({ kind: 'guess', guess_position: 7, guess_result: 'N', took_turn: true })))
      .toEqual({ ...BASE, took_turn: true, kind: 'guess', guess_position: 7, guess_result: 'N' })
  })

  it('carries no payload on a pass or a hint', () => {
    expect(toDuetEvent(row({ kind: 'pass', took_turn: true }))).toEqual({ ...BASE, took_turn: true, kind: 'pass' })
    expect(toDuetEvent(row({ kind: 'hint' }))).toEqual({ ...BASE, kind: 'hint' })
  })

  it('throws on a row the table\'s own CHECK would have refused', () => {
    expect(() => toDuetEvent(row({ kind: 'clue', clue_word: 'TOOLS' }))).toThrow(/BUG/)
    expect(() => toDuetEvent(row({ kind: 'clue', clue_word: 'TOOLS', clue_count: 2 }))).toThrow(/BUG/)
    expect(() => toDuetEvent(row({ kind: 'guess', guess_position: 3 }))).toThrow(/BUG/)
    expect(() => toDuetEvent(row({ kind: 'nonsense' }))).toThrow(/BUG/)
  })
})

describe('cluesOf / guessesOf', () => {
  const events = [
    row({ id: 1, kind: 'clue', clue_word: 'TOOLS', clue_count: 2, clue_from_ai: false }),
    row({ id: 2, kind: 'hint' }),
    row({ id: 3, kind: 'guess', seat: 'B', guess_position: 4, guess_result: 'G' }),
    row({ id: 4, kind: 'guess', seat: 'B', guess_position: 9, guess_result: 'N' }),
    row({ id: 5, kind: 'pass', seat: 'B' }),
  ].map(toDuetEvent)

  it('picks the clues out, in order', () => {
    expect(cluesOf(events).map((c) => c.id)).toEqual([1])
  })

  it('picks the guesses out, in order, each with the word on its tile', () => {
    const words = [{ position: 4, word: 'HAMMER' }, { position: 9, word: 'COFFEE' }]
    expect(guessesOf(events, words).map((g) => [g.id, g.word])).toEqual([[3, 'HAMMER'], [4, 'COFFEE']])
  })
})
