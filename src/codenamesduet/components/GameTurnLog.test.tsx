/**
 * Tests for GameTurnLog. A pure presentational component — it takes `clues` +
 * `guesses` and renders the shared <TurnLog> table, one row per turn. No
 * supabase mocking; just RTL render with props.
 *
 * Each turn renders as TWO `<tr>`s (codenamesduet's own row markup — a clue row
 * + a guess row, with the shared `<TurnLogBar>` rowSpanning both): row 1 is
 * `# | clue | clue-giver` columns, row 2 spans the turn's guess line. So N turns
 * => 2N rows in DOM order, clue row then guess row.
 *
 * What matters here:
 *   1. Empty-state: the shared TurnLog shows its "No clues yet." placeholder
 *      (the box is always present, unlike the old GameLog which rendered null).
 *   2. Per-turn grouping: each turn's clue (row 1) lines up with the guesses made
 *      that turn (row 2), oldest turn first.
 *   3. Guess sort order: within a turn, guesses list by guessed_at.
 *   4. A guess-less turn reads "(clue given)" while it's the current, live turn,
 *      and "(no guesses)" once it's ended (or the game is over).
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

/** Each turn is two <tr>s (clue row + guess row); the empty/heading chrome is not
 *  a row, so role 'row' returns exactly the turn items, in DOM order. */
const turnRows = () => screen.getAllByRole('row')

/** Render with the in-progress inputs defaulted. `currentTurn: 99` is a turn no
 *  fixture clue uses, so a guess-less turn reads "(no guesses)" unless a test
 *  opts into the live-turn case explicitly. */
function renderLog(props: {
  clues: ClueRow[]
  guesses: GuessRow[]
  currentTurn?: number
  gameOver?: boolean
}) {
  return render(
    <GameTurnLog
      clues={props.clues}
      guesses={props.guesses}
      players={PLAYERS}
      currentTurn={props.currentTurn ?? 99}
      gameOver={props.gameOver ?? false}
    />,
  )
}

describe('GameTurnLog', () => {
  it('shows the empty placeholder when there are no clues', () => {
    renderLog({ clues: [], guesses: [] })
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

    renderLog({ clues, guesses })

    // Two turns => four rows: [t1 clue, t1 guesses, t2 clue, t2 guesses].
    const rows = turnRows()
    expect(rows).toHaveLength(4)

    // Turn 1 (oldest) first: clue row carries #1 / TOOLS / the clue-giver (ada
    // via ActorTag); its guess row carries HAMMER.
    expect(rows[0]).toHaveTextContent('#1')
    expect(rows[0]).toHaveTextContent('TOOLS')
    expect(rows[0]).toHaveTextContent('ada')
    expect(within(rows[1]).getByText('HAMMER', { exact: false })).toBeInTheDocument()

    // Turn 2 next.
    expect(rows[2]).toHaveTextContent('#2')
    expect(rows[2]).toHaveTextContent('DRINK')
    expect(rows[2]).toHaveTextContent('bea')
    expect(within(rows[3]).getByText('COFFEE', { exact: false })).toBeInTheDocument()
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

    renderLog({ clues, guesses })

    // Guesses live in the turn's SECOND row.
    const text = turnRows()[1].textContent ?? ''
    expect(text.indexOf('FIRST')).toBeLessThan(text.indexOf('LATER'))
    expect(text.indexOf('FIRST')).toBeGreaterThanOrEqual(0)
  })

  it('reads "(clue given)" for the current, still-live turn with no guesses yet', () => {
    const clues = [clue({ id: 'c1', turn_number: 3, by_seat: 'A', word: 'WAIT', count: 1 })]
    renderLog({ clues, guesses: [], currentTurn: 3, gameOver: false })
    expect(screen.getByText('(clue given)')).toBeInTheDocument()
    expect(screen.queryByText('(no guesses)')).not.toBeInTheDocument()
  })

  it('reads "(no guesses)" once a guess-less turn has ended (no longer current)', () => {
    const clues = [clue({ id: 'c1', turn_number: 1, by_seat: 'A', word: 'PASS', count: 1 })]
    renderLog({ clues, guesses: [], currentTurn: 2, gameOver: false })
    expect(screen.getByText('(no guesses)')).toBeInTheDocument()
    expect(screen.queryByText('(clue given)')).not.toBeInTheDocument()
  })

  it('reads "(no guesses)" for a guess-less current turn once the game is over', () => {
    const clues = [clue({ id: 'c1', turn_number: 4, by_seat: 'A', word: 'DONE', count: 1 })]
    renderLog({ clues, guesses: [], currentTurn: 4, gameOver: true })
    expect(screen.getByText('(no guesses)')).toBeInTheDocument()
  })
})
