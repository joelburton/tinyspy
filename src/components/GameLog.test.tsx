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
 *   4. The label-class wiring (G → log-label-G, etc.).
 */

import { render, screen, within } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { GameLog } from './GameLog'
import type { Database } from '../types/db'

type ClueRow = Database['public']['Tables']['clues']['Row']
type WordRow = Database['public']['Tables']['words']['Row']

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
    const { container } = render(<GameLog clues={[]} words={[]} />)
    expect(container).toBeEmptyDOMElement()
  })

  it('groups guesses under the turn whose clue they belong to, latest turn first', () => {
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

    render(<GameLog clues={clues} words={words} />)

    const turns = screen.getAllByRole('listitem')
    expect(turns).toHaveLength(2)

    // Latest turn (2) appears first.
    expect(turns[0]).toHaveTextContent('turn 2')
    expect(turns[0]).toHaveTextContent('DRINK')
    expect(within(turns[0]).getByText('COFFEE', { exact: false })).toBeInTheDocument()
    expect(within(turns[0]).getByText('neutral')).toBeInTheDocument()

    // Older turn (1) below.
    expect(turns[1]).toHaveTextContent('turn 1')
    expect(turns[1]).toHaveTextContent('TOOLS')
    expect(within(turns[1]).getByText('HAMMER', { exact: false })).toBeInTheDocument()
    expect(within(turns[1]).getByText('green')).toBeInTheDocument()
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

    render(<GameLog clues={clues} words={words} />)

    // Pull the textContent of the single turn slot and confirm FIRST
    // appears before LATER.
    const turn = screen.getByRole('listitem')
    const text = turn.textContent ?? ''
    expect(text.indexOf('FIRST')).toBeLessThan(text.indexOf('LATER'))
    expect(text.indexOf('FIRST')).toBeGreaterThanOrEqual(0)
  })

  it('attaches a per-label CSS class so each outcome gets its own color', () => {
    // We don't assert on the resolved color (CSS isn't loaded in this
    // test environment); we just assert the class hook is wired so the
    // stylesheet has something to latch onto.
    const clues = [clue({ turn_number: 1 })]
    const words = [
      word({ position: 0, word: 'G_WORD', revealed_as: 'G', revealed_by: 'B',
             revealed_at: '2026-06-12T18:01:00Z', revealed_in_turn: 1 }),
      word({ position: 1, word: 'N_WORD', revealed_as: 'N', revealed_by: 'B',
             revealed_at: '2026-06-12T18:02:00Z', revealed_in_turn: 1 }),
      word({ position: 2, word: 'A_WORD', revealed_as: 'A', revealed_by: 'B',
             revealed_at: '2026-06-12T18:03:00Z', revealed_in_turn: 1 }),
    ]

    render(<GameLog clues={clues} words={words} />)

    expect(screen.getByText('green')).toHaveClass('log-label-G')
    expect(screen.getByText('neutral')).toHaveClass('log-label-N')
    expect(screen.getByText('assassin')).toHaveClass('log-label-A')
  })
})
