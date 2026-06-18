/**
 * Tests for GameLog. This is a pure presentational component — it
 * takes `clues` + `words` and renders a turn-by-turn replay. No
 * supabase mocking needed; just RTL render with props.
 *
 * What matters here:
 *   1. Empty-state: render nothing when there are no clues.
 *   2. Per-turn grouping: each turn's clue lines up with the guesses
 *      that happened during that turn.
 *   3. Guess sort order: within a turn, guesses are listed by
 *      revealed_at (so the log replays in the order things happened).
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
type WordRow = Database['tinyspy']['Tables']['words']['Row']

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

function word(overrides: Partial<WordRow>): WordRow {
  return {
    game_id: 'game-id',
    position: 0,
    word: 'STEEL',
    revealed_by: null,
    revealed_as: null,
    revealed_at: null,
    revealed_in_turn: null,
    ...overrides,
  }
}

describe('GameLog', () => {
  it('renders nothing when there are no clues', () => {
    const { container } = render(<GameLog clues={[]} words={[]} players={PLAYERS} />)
    expect(container).toBeEmptyDOMElement()
  })

  it('groups guesses under the turn whose clue they belong to, oldest turn first', () => {
    const clues = [
      clue({ id: 'c1', turn_number: 1, by_seat: 'A', word: 'TOOLS', count: 2 }),
      clue({ id: 'c2', turn_number: 2, by_seat: 'B', word: 'DRINK', count: 1 }),
    ]
    const words = [
      word({
        position: 5, word: 'HAMMER',
        revealed_as: 'G', revealed_by: 'B',
        revealed_at: '2026-06-12T18:01:00Z', revealed_in_turn: 1,
      }),
      word({
        position: 11, word: 'COFFEE',
        revealed_as: 'N', revealed_by: 'A',
        revealed_at: '2026-06-12T18:03:00Z', revealed_in_turn: 2,
      }),
    ]

    render(<GameLog clues={clues} words={words} players={PLAYERS} />)

    const turns = screen.getAllByRole('listitem')
    expect(turns).toHaveLength(2)

    // Oldest turn (1) appears first in chronological order.
    expect(turns[0]).toHaveTextContent('Turn 1')
    expect(turns[0]).toHaveTextContent('TOOLS')
    expect(within(turns[0]).getByText('HAMMER', { exact: false })).toBeInTheDocument()
    expect(within(turns[0]).getByText('green')).toBeInTheDocument()

    // Latest turn (2) below — auto-scroll keeps it in view in the
    // real app, but the DOM order is oldest-first.
    expect(turns[1]).toHaveTextContent('Turn 2')
    expect(turns[1]).toHaveTextContent('DRINK')
    expect(within(turns[1]).getByText('COFFEE', { exact: false })).toBeInTheDocument()
    expect(within(turns[1]).getByText('neutral')).toBeInTheDocument()
  })

  it('sorts guesses within a turn by revealed_at', () => {
    // Two guesses in the same turn, deliberately presented in the
    // wrong order in the input array. The log should still display
    // them in revealed_at order.
    const clues = [clue({ turn_number: 1 })]
    const words = [
      word({
        position: 2, word: 'LATER',
        revealed_as: 'G', revealed_by: 'B',
        revealed_at: '2026-06-12T18:00:20Z', revealed_in_turn: 1,
      }),
      word({
        position: 1, word: 'FIRST',
        revealed_as: 'G', revealed_by: 'B',
        revealed_at: '2026-06-12T18:00:10Z', revealed_in_turn: 1,
      }),
    ]

    render(<GameLog clues={clues} words={words} players={PLAYERS} />)

    // Pull the textContent of the single turn slot and confirm FIRST
    // appears before LATER.
    const turn = screen.getByRole('listitem')
    const text = turn.textContent ?? ''
    expect(text.indexOf('FIRST')).toBeLessThan(text.indexOf('LATER'))
    expect(text.indexOf('FIRST')).toBeGreaterThanOrEqual(0)
  })

  it('renders the readable label name for each revealed_as value', () => {
    // The label-name → readable-string mapping is what shows up in
    // the chip; we assert each outcome renders the right word.
    // (Visual color is a CSS contract — see the file docstring.)
    const clues = [clue({ turn_number: 1 })]
    const words = [
      word({ position: 0, word: 'G_WORD', revealed_as: 'G', revealed_by: 'B',
             revealed_at: '2026-06-12T18:01:00Z', revealed_in_turn: 1 }),
      word({ position: 1, word: 'N_WORD', revealed_as: 'N', revealed_by: 'B',
             revealed_at: '2026-06-12T18:02:00Z', revealed_in_turn: 1 }),
      word({ position: 2, word: 'A_WORD', revealed_as: 'A', revealed_by: 'B',
             revealed_at: '2026-06-12T18:03:00Z', revealed_in_turn: 1 }),
    ]

    render(<GameLog clues={clues} words={words} players={PLAYERS} />)

    expect(screen.getByText('green')).toBeInTheDocument()
    expect(screen.getByText('neutral')).toBeInTheDocument()
    expect(screen.getByText('assassin')).toBeInTheDocument()
  })
})
