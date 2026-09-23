// cs-met-codenamesduet

import type { Database } from '@/types/db'
import type { KeyLabel } from './labels'
import type { Seat } from './phase'

/** A `codenamesduet.events` row as the generated types describe it: every
 *  payload column nullable, `kind` a plain string. `toDuetEvent` is where it
 *  becomes something a reader can trust. */
export type EventsRow = Pick<
  Database['codenamesduet']['Tables']['events']['Row'],
  | 'id' | 'user_id' | 'kind' | 'took_turn' | 'created_at' | 'turn_number' | 'seat'
  | 'clue_word' | 'clue_count' | 'guess_position' | 'guess_result'
>

/** The columns every event has. */
type EventBase = {
  // The row's own id, and the order of play.
  id: number
  user_id: string
  // Did this event use up a turn from the budget? A bystander in ordinary play
  // and a pass; nothing else.
  took_turn: boolean
  created_at: string
  // The turn it belongs to; the log groups on it.
  turn_number: number
  seat: Seat
}

/**
 * One thing a player did, with exactly the payload its kind carries — the
 * table's CHECK, restated as a type. The column names are the table's.
 */
export type DuetEvent =
  | (EventBase & { kind: 'clue'; clue_word: string; clue_count: number })
  | (EventBase & { kind: 'guess'; guess_position: number; guess_result: KeyLabel })
  | (EventBase & { kind: 'pass' })
  | (EventBase & { kind: 'hint' })

export type ClueEvent = Extract<DuetEvent, { kind: 'clue' }>
export type GuessEvent = Extract<DuetEvent, { kind: 'guess' }>

/** A guess with its board word beside it, for the surfaces that print it —
 *  the log, the history banner, the PDF. The table stores the tile; the word
 *  is `codenamesduet.words`'. */
export type WordedGuess = GuessEvent & { word: string }

/**
 * A row → its typed event. Throws on a row the table's own CHECK would have
 * refused, because reaching that means the schema and this file disagree —
 * a bug, not a state to draw.
 */
export function toDuetEvent(row: EventsRow): DuetEvent {
  const base: EventBase = {
    id: row.id,
    user_id: row.user_id,
    took_turn: row.took_turn,
    created_at: row.created_at,
    turn_number: row.turn_number,
    seat: row.seat as Seat,
  }
  switch (row.kind) {
    case 'clue':
      if (row.clue_word === null || row.clue_count === null) break
      return { ...base, kind: 'clue', clue_word: row.clue_word, clue_count: row.clue_count }
    case 'guess':
      if (row.guess_position === null || row.guess_result === null) break
      return {
        ...base, kind: 'guess',
        guess_position: row.guess_position, guess_result: row.guess_result as KeyLabel,
      }
    case 'pass':
      return { ...base, kind: 'pass' }
    case 'hint':
      return { ...base, kind: 'hint' }
  }
  throw new Error(`BUG: codenamesduet.events row ${row.id} is a '${row.kind}' without its payload`)
}

/** Every clue given, in the order given. */
export function cluesOf(events: ReadonlyArray<DuetEvent>): ClueEvent[] {
  return events.filter((e): e is ClueEvent => e.kind === 'clue')
}

/** Every guess, in the order made, each with the word on its tile. */
export function guessesOf(
  events: ReadonlyArray<DuetEvent>,
  words: ReadonlyArray<{ position: number; word: string }>,
): WordedGuess[] {
  const wordAt = new Map(words.map((w) => [w.position, w.word]))
  return events
    .filter((e): e is GuessEvent => e.kind === 'guess')
    .map((e) => ({ ...e, word: wordAt.get(e.guess_position) ?? '' }))
}
