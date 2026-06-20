/**
 * Tests for GameLog. This is a pure presentational component — it
 * takes `clues` + `guesses` and renders a turn-by-turn replay. No
 * supabase mocking needed; just RTL render with props.
 *
 * What matters here:
 *   1. Empty-state: render nothing when there are no clues.
 *   2. Per-turn grouping: each turn's clue lines up with the guesses
 *      that happened during that turn.
 *   3. Guess sort order: within a turn, guesses are listed by
 *      guessed_at (so the log replays in the order things happened).
 *
 * NOT covered: the per-label color hookup. With CSS Modules the
 * literal class name is hashed (`_logLabelG_a3f9k` etc.) so
 * asserting on a specific string would be brittle, and Vitest is
 * configured with css: false so the styles object the component
 * reads is an empty object at test time. The presence and text of
 * each label is asserted; that the right CSS variant is applied is
 * a visual contract checked by the developer in the browser.
 */

import { render, screen, within } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { GameLog } from './GameLog'
import type { GuessRow } from '../hooks/useBoard'
import type { Player } from '../hooks/useGame'
import type { Database } from '../../types/db'

// Stable two-seat roster for every test render. The colors
// aren't asserted on — the component picks them up via a style
// attribute the tests don't introspect — but the prop is
// required and the lookup map needs both seats.
const PLAYERS: Player[] = [
  { user_id: 'ada', seat: 'A', username: 'ada', color: 'red' },
  { user_id: 'bea', seat: 'B', username: 'bea', color: 'blue' },
]

type ClueRow = Database['tinyspy']['Tables']['clues']['Row']

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

describe('GameLog', () => {
  it('renders nothing when there are no clues', () => {
    const { container } = render(<GameLog clues={[]} guesses={[]} players={PLAYERS} />)
    expect(container).toBeEmptyDOMElement()
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

    render(<GameLog clues={clues} guesses={guesses} players={PLAYERS} />)

    const turns = screen.getAllByRole('listitem')
    expect(turns).toHaveLength(2)

    // Oldest turn (1) appears first in chronological order.
    expect(turns[0]).toHaveTextContent('#1')
    expect(turns[0]).toHaveTextContent('TOOLS')
    expect(within(turns[0]).getByText('HAMMER', { exact: false })).toBeInTheDocument()

    // Latest turn (2) below — auto-scroll keeps it in view in the
    // real app, but the DOM order is oldest-first.
    expect(turns[1]).toHaveTextContent('#2')
    expect(turns[1]).toHaveTextContent('DRINK')
    expect(within(turns[1]).getByText('COFFEE', { exact: false })).toBeInTheDocument()
  })

  it('sorts guesses within a turn by guessed_at', () => {
    // Two guesses in the same turn, deliberately presented in the
    // wrong order in the input array. The log should still display
    // them in guessed_at order.
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

    render(<GameLog clues={clues} guesses={guesses} players={PLAYERS} />)

    // Pull the textContent of the single turn slot and confirm FIRST
    // appears before LATER.
    const turn = screen.getByRole('listitem')
    const text = turn.textContent ?? ''
    expect(text.indexOf('FIRST')).toBeLessThan(text.indexOf('LATER'))
    expect(text.indexOf('FIRST')).toBeGreaterThanOrEqual(0)
  })

  it('renders the "no guesses made" placeholder when the turn has a clue but no guesses', () => {
    // The guesser passed without revealing anything. The guess line still
    // renders (with its `->` lead-in) so the reader sees the turn happened.
    const clues = [
      clue({ id: 'c1', turn_number: 1, by_seat: 'A', word: 'PASS', count: 1 }),
    ]

    render(<GameLog clues={clues} guesses={[]} players={PLAYERS} />)

    expect(screen.getByText(/no guesses made/)).toBeInTheDocument()
    // The guesser is no longer named — the line leads with an arrow.
    const turn = screen.getByRole('listitem')
    expect(turn.textContent ?? '').toContain('->')
  })
})
