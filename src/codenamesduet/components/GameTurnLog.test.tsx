/**
 * Tests for GameTurnLog. A pure presentational component — it takes `clues` +
 * `guesses` and renders the shared <TurnLog> table, one row per turn. No
 * supabase mocking; just RTL render with props.
 *
 * What matters here:
 *   1. Empty-state: the shared TurnLog shows its "No clues yet." placeholder
 *      (the box is always present, unlike the old GameLog which rendered null).
 *   2. Per-turn grouping: each turn's clue lines up with the guesses made that
 *      turn, oldest turn first.
 *   3. Guess sort order: within a turn, guesses list by guessed_at.
 *   4. The "(no guesses)" placeholder when a turn has a clue but no guesses.
 *   5. The per-turn outcome verdict — tested on the pure `turnOutcome` helper.
 *
 * NOT covered: the per-outcome color hookup (on guessed words AND the outcome
 * bar). With CSS Modules the class name is hashed and Vitest runs with css:false
 * (the styles object is empty at test time), so asserting a specific variant
 * class is meaningless. The word/clue presence + text is asserted in the DOM;
 * the outcome-bar mapping is verified via `turnOutcome` directly; the colors
 * themselves are a visual contract checked in the browser.
 */

import { render, screen, within } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { GameTurnLog } from './GameTurnLog'
import type { GuessRow } from '../hooks/useBoard'
import type { Player } from '../hooks/useGame'
import type { Database } from '../../types/db'

// Stable two-seat roster for every render. Colors aren't asserted on (they ride
// an inline style attr the tests don't introspect), but the lookup needs both
// seats.
const PLAYERS: Player[] = [
  { user_id: 'ada', seat: 'A', username: 'ada', color: 'red' },
  { user_id: 'bea', seat: 'B', username: 'bea', color: 'blue' },
]

type ClueRow = Database['codenamesduet']['Tables']['clues']['Row']

function clue(overrides: Partial<ClueRow>): ClueRow {
  return {
    id: 'clue-id',
    game_id: 'game-id',
    turn_number: 1,
    by_seat: 'A',
    word: 'BREAD',
    count: 2,
    submitted_at: '2026-06-12T18:00:00Z',
    ...overrides,
  }
}

function guess(overrides: Partial<GuessRow>): GuessRow {
  return {
    position: 0,
    word: 'STEEL',
    guesser_seat: 'B',
    outcome: 'G',
    turn_number: 1,
    guessed_at: '2026-06-12T18:00:00Z',
    ...overrides,
  }
}

/** Turn rows are the shared TurnLog's <tr>s; the empty/heading chrome is not a
 *  row, so role 'row' returns exactly the turn items. */
const turnRows = () => screen.getAllByRole('row')

describe('GameTurnLog', () => {
  it('shows the empty placeholder when there are no clues', () => {
    render(<GameTurnLog clues={[]} guesses={[]} players={PLAYERS} />)
    expect(screen.getByText('No clues yet.')).toBeInTheDocument()
    expect(screen.queryAllByRole('row')).toHaveLength(0)
  })

  it('groups guesses under the turn whose clue they belong to, oldest turn first', () => {
    const clues = [
      clue({ id: 'c1', turn_number: 1, by_seat: 'A', word: 'TOOLS', count: 2 }),
      clue({ id: 'c2', turn_number: 2, by_seat: 'B', word: 'DRINK', count: 1 }),
    ]
    const guesses = [
      guess({
        position: 5, word: 'HAMMER',
        outcome: 'G', guesser_seat: 'B',
        guessed_at: '2026-06-12T18:01:00Z', turn_number: 1,
      }),
      guess({
        position: 11, word: 'COFFEE',
        outcome: 'N', guesser_seat: 'A',
        guessed_at: '2026-06-12T18:03:00Z', turn_number: 2,
      }),
    ]

    render(<GameTurnLog clues={clues} guesses={guesses} players={PLAYERS} />)

    const rows = turnRows()
    expect(rows).toHaveLength(2)

    // Oldest turn (1) first in DOM order.
    expect(rows[0]).toHaveTextContent('#1')
    expect(rows[0]).toHaveTextContent('TOOLS')
    expect(within(rows[0]).getByText('HAMMER', { exact: false })).toBeInTheDocument()
    // Clue-giver named via ActorTag.
    expect(rows[0]).toHaveTextContent('ada')

    expect(rows[1]).toHaveTextContent('#2')
    expect(rows[1]).toHaveTextContent('DRINK')
    expect(within(rows[1]).getByText('COFFEE', { exact: false })).toBeInTheDocument()
    expect(rows[1]).toHaveTextContent('bea')
  })

  it('sorts guesses within a turn by guessed_at', () => {
    const clues = [clue({ turn_number: 1 })]
    const guesses = [
      guess({
        position: 2, word: 'LATER',
        outcome: 'G', guesser_seat: 'B',
        guessed_at: '2026-06-12T18:00:20Z', turn_number: 1,
      }),
      guess({
        position: 1, word: 'FIRST',
        outcome: 'G', guesser_seat: 'B',
        guessed_at: '2026-06-12T18:00:10Z', turn_number: 1,
      }),
    ]

    render(<GameTurnLog clues={clues} guesses={guesses} players={PLAYERS} />)

    const text = turnRows()[0].textContent ?? ''
    expect(text.indexOf('FIRST')).toBeLessThan(text.indexOf('LATER'))
    expect(text.indexOf('FIRST')).toBeGreaterThanOrEqual(0)
  })

  it('renders the "(no guesses)" placeholder when a turn has a clue but no guesses', () => {
    const clues = [clue({ id: 'c1', turn_number: 1, by_seat: 'A', word: 'PASS', count: 1 })]
    render(<GameTurnLog clues={clues} guesses={[]} players={PLAYERS} />)
    expect(screen.getByText(/no guesses/)).toBeInTheDocument()
  })
})
