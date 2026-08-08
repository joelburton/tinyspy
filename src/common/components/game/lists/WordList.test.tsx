/**
 * Tests for the shared WordList's heading tally: "Words: N · Score: M" over
 * **the currently filtered list** — the feature's whole point is that the
 * filters become a reading tool (a player's coop contribution; the missed
 * words' cost at terminal), so the numbers must track the filter, not the
 * full row set. Score renders only when the game's rows carry points at all,
 * gated on ALL rows so it doesn't blink away when a filter empties the list.
 */
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it } from 'vitest'
import { WordList, type WordListRow } from './WordList'
import type { Member } from '../../../lib/games'

const PLAYERS: Member[] = [
  { user_id: 'ada', username: 'ada', color: 'red' },
  { user_id: 'bea', username: 'bea', color: 'blue' },
]

const ROWS: WordListRow[] = [
  { kind: 'found', word: 'bead', userId: 'ada', points: 1 },
  { kind: 'found', word: 'beach', userId: 'bea', points: 5 },
  { kind: 'unfound', word: 'chafe', points: 5 },
]

const base = {
  players: PLAYERS,
  selfId: 'ada',
  isCompete: false,
  isTerminal: true,
  hasBonus: false,
}

describe('WordList — the heading tally', () => {
  it('counts and scores the whole list at the default filter', () => {
    render(<WordList rows={ROWS} {...base} />)
    expect(screen.getByRole('heading', { level: 3 })).toHaveTextContent('Words: 3 · Score: 11')
  })

  it('tracks the WHO filter — a player, then the missed words', async () => {
    const user = userEvent.setup()
    render(<WordList rows={ROWS} {...base} />)
    const who = screen.getByLabelText('Whose words to show')

    await user.selectOptions(who, 'bea')
    expect(screen.getByRole('heading', { level: 3 })).toHaveTextContent('Words: 1 · Score: 5')

    // The terminal reveal's cost, as a number: what the missed words were worth.
    await user.selectOptions(who, screen.getByRole('option', { name: 'Missed' }))
    expect(screen.getByRole('heading', { level: 3 })).toHaveTextContent('Words: 1 · Score: 5')
  })

  it('omits the score entirely when the rows carry no points', () => {
    const unscored = ROWS.map((r) => ({ ...r, points: undefined }))
    render(<WordList rows={unscored} {...base} />)
    expect(screen.getByRole('heading', { level: 3 })).toHaveTextContent(/^Words: 3$/)
  })
})
