/**
 * Tests for useTurnLogPlayerPicker — the "whose turns?" dropdown extracted from
 * wordle's GameTurnLog when wordiply became the second consumer.
 *
 * The pieces worth pinning are the ones a re-derivation gets subtly wrong: the
 * coop-collapses-to-Team rule, the default selection for a SPECTATOR (who has no
 * log of their own), and the honest empty line — an opponent's log is empty
 * mid-game because RLS hides it, not because they haven't played, and saying
 * "no guesses yet" there would be a lie.
 */

import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it } from 'vitest'
import { renderHook } from '@testing-library/react'
import { gp } from '../../test/gamePlayers'
import { useTurnLogPlayerPicker } from './useTurnLogPlayerPicker'

type Row = { user_id: string; word: string }
const rows: Row[] = [
  { user_id: 'u1', word: 'mine' },
  { user_id: 'u2', word: 'theirs' },
]
const two = [gp('u1', 'me', 'red'), gp('u2', 'moth', 'blue')]

const setup = (over: Partial<Parameters<typeof useTurnLogPlayerPicker>[0]> = {}) =>
  renderHook(() =>
    useTurnLogPlayerPicker<Row>({
      players: two,
      selfId: 'u1',
      mode: 'compete',
      isTerminal: false,
      ...over,
    }),
  )

describe('useTurnLogPlayerPicker', () => {
  it('coop with 2+ players collapses to one shared Team view', () => {
    const { result } = setup({ mode: 'coop' })
    expect(result.current.teamView).toBe(true)
    // Team shows EVERY row — the board is shared, so there's nothing to filter.
    expect(result.current.filter(rows)).toHaveLength(2)
    expect(result.current.boardIsShown).toBe(true)
  })

  it('a SOLO coop game still lists the player rather than collapsing', () => {
    const { result } = setup({ mode: 'coop', players: [two[0]] })
    expect(result.current.teamView).toBe(false)
  })

  it('compete defaults to my own log and filters to it', () => {
    const { result } = setup()
    expect(result.current.picked).toBe('u1')
    expect(result.current.filter(rows).map((r) => r.word)).toEqual(['mine'])
    expect(result.current.boardIsShown).toBe(true)
  })

  it('a spectator (not a player) defaults to the first listed player', () => {
    const { result } = setup({ selfId: 'u9' })
    expect(result.current.picked).toBe('u1')
    // Not my board — a game with a history viewer must not offer `#N` as a live
    // handle here, since the main surface is still showing something else.
    expect(result.current.boardIsShown).toBe(false)
  })

  it("says an opponent's empty log is HIDDEN mid-game, and empty at terminal", async () => {
    const user = userEvent.setup()
    function Probe({ isTerminal }: { isTerminal: boolean }) {
      const who = useTurnLogPlayerPicker<Row>({
        players: two,
        selfId: 'u1',
        mode: 'compete',
        isTerminal,
        emptyLabel: 'No guesses yet.',
      })
      return (
        <>
          {who.picker}
          <p data-testid="empty">{who.emptyText}</p>
        </>
      )
    }

    const { rerender } = render(<Probe isTerminal={false} />)
    // My own log: an honest "none yet".
    expect(screen.getByTestId('empty')).toHaveTextContent('No guesses yet.')

    await user.selectOptions(screen.getByRole('combobox'), 'u2')
    expect(screen.getByTestId('empty')).toHaveTextContent('Hidden until game ends.')

    rerender(<Probe isTerminal={true} />)
    await user.selectOptions(screen.getByRole('combobox'), 'u2')
    expect(screen.getByTestId('empty')).toHaveTextContent('No guesses yet.')
  })

  it('labels me "You" and lists me first, whatever order the players arrive in', () => {
    render(<Picker />)
    const opts = screen.getAllByRole('option')
    // 'All' leads in multi-player compete — see the All-view block below.
    expect(opts.map((o) => o.textContent)).toEqual(['All', 'You', 'moth'])
  })
})

function Picker() {
  const who = useTurnLogPlayerPicker<Row>({
    players: [two[1], two[0]], // deliberately NOT self-first on the way in
    selfId: 'u1',
    mode: 'compete',
    isTerminal: false,
  })
  return <>{who.picker}</>
}

/**
 * The compete "All" view (added with connections, 2026-08-02). It's the reason
 * the vocabulary is worth stating once: solo → "You", team coop → "Team",
 * compete → "All" plus each player, defaulting to yourself.
 */
describe('useTurnLogPlayerPicker — the compete All view', () => {
  it('offers All in multi-player compete, but still defaults to me', () => {
    const { result } = setup()
    expect(result.current.picked).toBe('u1')
    render(<>{result.current.picker}</>)
    expect(screen.getAllByRole('option').map((o) => o.textContent)).toEqual(['All', 'You', 'moth'])
  })

  it('does NOT offer All in coop — "Team" already is everyone', () => {
    const { result } = setup({ mode: 'coop' })
    render(<>{result.current.picker}</>)
    expect(screen.getAllByRole('option').map((o) => o.textContent)).toEqual(['Team'])
  })

  it('does NOT offer All in a solo game — it would duplicate "You"', () => {
    const { result } = setup({ players: [two[0]] })
    render(<>{result.current.picker}</>)
    expect(screen.getAllByRole('option').map((o) => o.textContent)).toEqual(['You'])
  })

  it('shows every player’s rows when All is picked, and no board handle', async () => {
    const user = userEvent.setup()
    function Probe() {
      const who = useTurnLogPlayerPicker<Row>({
        players: two,
        selfId: 'u1',
        mode: 'compete',
        isTerminal: true,
      })
      return (
        <>
          {who.picker}
          <p data-testid="rows">{who.filter(rows).map((r) => r.word).join(',')}</p>
          <p data-testid="board">{String(who.boardIsShown)}</p>
        </>
      )
    }
    render(<Probe />)
    expect(screen.getByTestId('rows')).toHaveTextContent('mine')

    await user.selectOptions(screen.getByRole('combobox'), 'all')
    expect(screen.getByTestId('rows')).toHaveTextContent('mine,theirs')
    // All is nobody's board in particular, so #N must not be a live handle.
    expect(screen.getByTestId('board')).toHaveTextContent('false')
  })

  it('never calls the All view "hidden" — it always carries my own rows', async () => {
    const user = userEvent.setup()
    function Probe() {
      const who = useTurnLogPlayerPicker<Row>({
        players: two,
        selfId: 'u1',
        mode: 'compete',
        isTerminal: false,
        emptyLabel: 'No guesses yet.',
      })
      return (
        <>
          {who.picker}
          <p data-testid="empty">{who.emptyText}</p>
        </>
      )
    }
    render(<Probe />)
    // A single opponent mid-game IS hidden…
    await user.selectOptions(screen.getByRole('combobox'), 'u2')
    expect(screen.getByTestId('empty')).toHaveTextContent('Hidden until game ends.')
    // …but All is not: RLS still gives me mine, so empty means nobody played.
    await user.selectOptions(screen.getByRole('combobox'), 'all')
    expect(screen.getByTestId('empty')).toHaveTextContent('No guesses yet.')
  })
})
