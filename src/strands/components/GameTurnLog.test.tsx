/**
 * Tests for strands' GameTurnLog — a pure presentational component (props in,
 * the shared `<TurnLog>` table out; no supabase mocking).
 *
 * The reason this file exists is the **hint row**. `strands.events` holds two
 * kinds of row, and only one of them is a guess: a spent hint has no word and
 * no verdict. Everything about how it renders is a deliberate choice that this
 * pins — that it appears at all, that it takes an ordinary numbered position in
 * the sequence (which is what the history viewer indexes by), and that it says
 * "Hint used" rather than leaving the word slot blank.
 *
 * NOT covered: the per-outcome colours and the glyph. With CSS Modules the class
 * names are hashed and Vitest runs with `css: false`, so asserting a variant
 * class is meaningless; the bar colour and the lightbulb are a visual contract
 * checked in the browser.
 */

import { render, screen, within } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { GameTurnLog } from './GameTurnLog'
import type { EventRow, GuessResult } from '../hooks/useGame'
import type { Member } from '../../common/lib/games'

const ADA = 'ada'
const PLAYERS = [
  { user_id: ADA, username: 'ada', color: 'red' },
] as unknown as Member[]

let n = 0
const guess = (word: string, result: GuessResult): EventRow => ({
  kind: 'guess',
  id: `e${n++}`, game_id: 'g', user_id: ADA, word, path: [[0, 0]],
  result, created_at: '2026-01-01',
})

const hint = (): EventRow => ({
  kind: 'hint',
  id: `e${n++}`, game_id: 'g', user_id: ADA, word: null, path: [[1, 0], [1, 1]],
  result: null, created_at: '2026-01-01',
})

function renderLog(events: EventRow[], onSelectTurn = vi.fn()) {
  render(
    <GameTurnLog
      events={events}
      players={PLAYERS}
      selfId={ADA}
      mode="coop"
      isTerminal={false}
      viewingIndex={null}
      onSelectTurn={onSelectTurn}
    />,
  )
  return { onSelectTurn }
}

describe('GameTurnLog — a spent hint', () => {
  it('renders as its own row, saying what happened without naming a word', () => {
    renderLog([guess('APPLE', 'theme'), hint()])
    expect(screen.getByText('Hint used')).toBeInTheDocument()
    // The word slot is the one thing a hint cannot fill — and the row must not
    // borrow a neighbouring word to fill it.
    expect(screen.getAllByText(/APPLE/)).toHaveLength(1)
  })

  it('takes an ordinary numbered position in the sequence', () => {
    // Load-bearing, not cosmetic: the history viewer addresses a turn by its
    // POSITION in these rows, so a hint that skipped a number (or rendered as an
    // un-numbered interstitial) would slide every later turn's replay by one.
    renderLog([guess('APPLE', 'theme'), hint(), guess('SPAN', 'spangram')])
    const rows = screen.getAllByRole('row')
    expect(rows).toHaveLength(3)
    expect(within(rows[0]).getByText('#1')).toBeInTheDocument()
    expect(within(rows[1]).getByText('#2')).toBeInTheDocument()
    expect(within(rows[1]).getByText('Hint used')).toBeInTheDocument()
    expect(within(rows[2]).getByText('#3')).toBeInTheDocument()
  })

  it('is a live history handle, like every other turn', () => {
    // A hint turn is worth replaying — that is what its stored coords are FOR.
    const { onSelectTurn } = renderLog([guess('APPLE', 'theme'), hint()])
    const rows = screen.getAllByRole('row')
    within(rows[1]).getByText('#2').click()
    expect(onSelectTurn).toHaveBeenCalledWith(1)
  })

  it('still counts as a turn for the empty state', () => {
    renderLog([])
    expect(screen.getByText('No turns yet.')).toBeInTheDocument()
  })
})
