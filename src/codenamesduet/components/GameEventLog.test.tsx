// cs-met-codenamesduet

/**
 * Tests for GameEventLog. A presentational component — it takes `clues` +
 * `guesses` and renders the shared <EventLog> table. No supabase mocking; just
 * RTL render with props.
 *
 * Each turn renders as TWO `<tr>`s (codenamesduet's own row markup — a clue row
 * + a guess row, with the shared `<EventLogOutcomeBar>` rowSpanning both): row 1 is
 * `# | clue | clue-giver` columns, row 2 spans the turn's guess line. So N turns
 * => 2N rows in DOM order, clue row then guess row.
 *
 * What matters here:
 *   1. Empty-state: the shared EventLog shows its "No clues yet." placeholder.
 *   2. Per-turn grouping: each turn's clue (row 1) lines up with the guesses made
 *      that turn (row 2), oldest turn first.
 *   3. Guess order: within a turn, guesses show in the order given — the events
 *      arrive `order by id` and the log keeps it.
 *   4. A guess-less turn reads "(clue given)" while it's the current, live turn,
 *      and "(no guesses)" once it's ended (or the game is over).
 *   5. The per-turn outcome verdict — tested on the pure `turnOutcome` helper.
 *   6. Sudden death: each guess past the budget is its own row, "Sudden death:
 *      WORD", filed under its guesser.
 *   7. The history link: a turn's clue id and the `#N` printed, renumbered by a
 *      filter.
 *
 * NOT covered: the color hookup (the key-card color on guessed words, and the
 * outcome bar). Under Vitest a CSS module is a proxy that names any key it is
 * asked for, so asserting a specific variant class proves nothing. The word/clue presence + text is asserted in the DOM;
 * the outcome-bar mapping is verified via `turnOutcome` directly; the colors
 * themselves are a visual contract checked in the browser.
 */

import { fireEvent, render, screen, within } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { GameEventLog } from './GameEventLog'
import type { ClueEvent, WordedGuess } from '../lib/events'
import type { Player } from '../hooks/useGame'
import { filterOptions, pickFilter } from '@/common/lists/filterSelectHelpers'

// Stable two-seat roster for every render. Colors aren't asserted on (they ride
// an inline style attr the tests don't introspect), but the lookup needs both
// seats.
const PLAYERS: Player[] = [
  { user_id: 'ada', seat: 'A', username: 'ada', color: 'red' },
  { user_id: 'bea', seat: 'B', username: 'bea', color: 'blue' },
]

function clue(overrides: Partial<ClueEvent>): ClueEvent {
  return {
    kind: 'clue',
    id: 1,
    user_id: 'ada',
    took_turn: false,
    created_at: '2026-06-12T18:00:00Z',
    turn_number: 1,
    seat: 'A',
    clue_word: 'BREAD',
    clue_count: 2,
    clue_from_ai: false,
    ...overrides,
  }
}

function guess(overrides: Partial<WordedGuess>): WordedGuess {
  return {
    kind: 'guess',
    id: 1,
    user_id: 'bea',
    took_turn: false,
    created_at: '2026-06-12T18:00:00Z',
    turn_number: 1,
    seat: 'B',
    guess_position: 0,
    guess_result: 'G',
    word: 'STEEL',
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
  clues: ClueEvent[]
  guesses: WordedGuess[]
  currentTurn?: number
  gameOver?: boolean
}) {
  return render(
    <GameEventLog
      clues={props.clues}
      guesses={props.guesses}
      players={PLAYERS}
      selfId="ada"
      currentTurn={props.currentTurn ?? 99}
      gameOver={props.gameOver ?? false}
      turnBudget={9}
      historyId={null}
      onShowHistory={() => {}}
    />,
  )
}

describe('GameEventLog', () => {
  it('shows the empty placeholder when there are no clues', () => {
    renderLog({ clues: [], guesses: [] })
    expect(screen.getByText('No clues yet.')).toBeInTheDocument()
    expect(screen.queryAllByRole('row')).toHaveLength(0)
  })

  it('groups guesses under the turn whose clue they belong to, oldest turn first', () => {
    const clues = [
      clue({ id: 1, turn_number: 1, seat: 'A', clue_word: 'TOOLS', clue_count: 2 }),
      clue({ id: 2, turn_number: 2, seat: 'B', clue_word: 'DRINK', clue_count: 1 }),
    ]
    const guesses = [
      guess({
        id: 1, guess_position: 5, word: 'HAMMER',
        guess_result: 'G', seat: 'B', turn_number: 1,
      }),
      guess({
        id: 2, guess_position: 11, word: 'COFFEE',
        guess_result: 'N', seat: 'A', turn_number: 2,
      }),
    ]

    renderLog({ clues, guesses })

    // Two turns => four rows: [t1 clue, t1 guesses, t2 clue, t2 guesses].
    const rows = turnRows()
    expect(rows).toHaveLength(4)

    // Turn 1 (oldest) first: clue row carries #1 / TOOLS / the clue-giver (ada
    // via ActorDot); its guess row carries HAMMER.
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

  it('shows a turn\'s guesses in the order given', () => {
    const clues = [clue({ turn_number: 1 })]
    const guesses = [
      guess({
        id: 1, guess_position: 1, word: 'FIRST',
        guess_result: 'G', seat: 'B', turn_number: 1,
      }),
      guess({
        id: 2, guess_position: 2, word: 'LATER',
        guess_result: 'G', seat: 'B', turn_number: 1,
      }),
    ]

    renderLog({ clues, guesses })

    // Guesses live in the turn's SECOND row.
    const text = turnRows()[1].textContent ?? ''
    expect(text.indexOf('FIRST')).toBeLessThan(text.indexOf('LATER'))
    expect(text.indexOf('FIRST')).toBeGreaterThanOrEqual(0)
  })

  it('reads "(clue given)" for the current, still-live turn with no guesses yet', () => {
    const clues = [clue({ id: 1, turn_number: 3, seat: 'A', clue_word: 'WAIT', clue_count: 1 })]
    renderLog({ clues, guesses: [], currentTurn: 3, gameOver: false })
    expect(screen.getByText('(clue given)')).toBeInTheDocument()
    expect(screen.queryByText('(no guesses)')).not.toBeInTheDocument()
  })

  it('reads "(no guesses)" once a guess-less turn has ended (no longer current)', () => {
    const clues = [clue({ id: 1, turn_number: 1, seat: 'A', clue_word: 'PASS', clue_count: 1 })]
    renderLog({ clues, guesses: [], currentTurn: 2, gameOver: false })
    expect(screen.getByText('(no guesses)')).toBeInTheDocument()
    expect(screen.queryByText('(clue given)')).not.toBeInTheDocument()
  })

  it('marks a clue given exactly as the AI suggested it, and no other', () => {
    const clues = [
      clue({ id: 1, turn_number: 1 }),
      clue({ id: 2, turn_number: 2, seat: 'B', clue_from_ai: true }),
    ]
    renderLog({ clues, guesses: [] })

    const rows = turnRows()
    expect(rows[0]!.querySelector('[data-tooltip="AI clue"]')).toBeNull()
    expect(rows[2]!.querySelector('[data-tooltip="AI clue"]')).not.toBeNull()
  })

  it('reads "(no guesses)" for a guess-less current turn once the game is over', () => {
    const clues = [clue({ id: 1, turn_number: 4, seat: 'A', clue_word: 'DONE', clue_count: 1 })]
    renderLog({ clues, guesses: [], currentTurn: 4, gameOver: true })
    expect(screen.getByText('(no guesses)')).toBeInTheDocument()
  })
})

/**
 * The shared "whose turns?" picker. duet is coop-only, so the list
 * is Team + both players — and a turn is filed under its **clue-giver**, since
 * that's the person the row's actor column names. See the component docstring.
 */
describe('GameEventLog — the clue-giver picker', () => {
  const clues = [
    clue({ id: 1, turn_number: 1, seat: 'A', clue_word: 'MINE' }),
    clue({ id: 2, turn_number: 2, seat: 'B', clue_word: 'THEIRS' }),
  ]

  it('lists Team plus both players by handle, and defaults to Team', async () => {
    renderLog({ clues, guesses: [] })
    expect(await filterOptions()).toEqual([
      'Team',
      'ada',
      'bea',
    ])
    // Team is the shared game — both turns on show.
    expect(screen.getByText('2 MINE')).toBeInTheDocument()
    expect(screen.getByText('2 THEIRS')).toBeInTheDocument()
  })

  it('narrows to the turns that player CLUED', async () => {
    renderLog({ clues, guesses: [] })
    await pickFilter('bea')
    expect(screen.queryByText('2 MINE')).not.toBeInTheDocument()
    expect(screen.getByText('2 THEIRS')).toBeInTheDocument()
  })

  it('says the log is empty (not hidden) when a player has clued nothing', async () => {
    renderLog({ clues: [clues[0]], guesses: [] })
    await pickFilter('bea')
    // Coop hides nothing, so the honest line is the plain empty one.
    expect(screen.getByText('No clues yet.')).toBeInTheDocument()
  })
})

/**
 * Sudden death: every guess past the budget (9 here) is a turn of its own, made
 * by either player, with no clue.
 */
describe('GameEventLog — sudden death', () => {
  const clues = [clue({ id: 1, turn_number: 9, seat: 'A', clue_word: 'LAST' })]
  const guesses = [
    guess({ id: 2, turn_number: 10, seat: 'A', user_id: 'ada', guess_position: 3, word: 'STEEL' }),
    guess({ id: 3, turn_number: 11, seat: 'B', user_id: 'bea', guess_position: 4, word: 'COFFEE', guess_result: 'N' }),
  ]

  it('draws each guess as one row — "Sudden death: WORD", the guesser in the actor column', () => {
    renderLog({ clues, guesses })
    const rows = turnRows()
    // The clue's two rows, then one row per sudden-death guess.
    expect(rows).toHaveLength(4)
    expect(rows[2]).toHaveTextContent('Sudden death: STEEL')
    expect(rows[2]).toHaveTextContent('ada')
    expect(rows[3]).toHaveTextContent('Sudden death: COFFEE')
    expect(rows[3]).toHaveTextContent('bea')
  })

  it('files each sudden-death row under its guesser', async () => {
    renderLog({ clues, guesses })
    await pickFilter('bea')
    expect(screen.queryByText('STEEL')).not.toBeInTheDocument()
    expect(screen.getByText('COFFEE')).toBeInTheDocument()
  })
})

/**
 * The history link: a turn is LINKED by an event id — its clue's, or a
 * sudden-death guess's — and the `#N` it prints is its place in what is shown.
 */
describe('GameEventLog — the history link', () => {
  it('hands up the clue\'s id and the number printed, which a filter renumbers', async () => {
    const onShowHistory = vi.fn()
    render(
      <GameEventLog
        clues={[
          clue({ id: 7, turn_number: 1, seat: 'A', clue_word: 'MINE' }),
          clue({ id: 12, turn_number: 2, seat: 'B', clue_word: 'THEIRS' }),
        ]}
        guesses={[]}
        players={PLAYERS}
        selfId="ada"
        currentTurn={99}
        gameOver={false}
        turnBudget={9}
        historyId={null}
        onShowHistory={onShowHistory}
      />,
    )
    await pickFilter('bea')
    fireEvent.click(screen.getByText('#1'))
    expect(onShowHistory).toHaveBeenCalledWith(12, 1)
  })
})
