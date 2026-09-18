// cs-blessed-event-log

/**
 * Tests for useEventLogPlayerPicker — the "whose turns?" dropdown every event-log
 * game shares.
 *
 * The vocabulary IS the feature (one list, every game), so most of these assert
 * the option list itself. The rest cover the pieces a re-derivation gets subtly
 * wrong: the default selection, the row filter, and the honest empty line — an
 * opponent's log is empty mid-game because RLS hides it, not because they
 * haven't played, and saying "nothing yet" there would be a lie.
 */

import { render, renderHook, screen } from '@testing-library/react'
import { filterOptions, pickFilter } from '../lists/filterSelectHelpers'
import { describe, expect, it } from 'vitest'
import { gp } from '../members/gamePlayer.fixture'
import { useEventLogPlayerPicker } from './useEventLogPlayerPicker'

type Row = { user_id: string; word: string }
const rows: Row[] = [
  { user_id: 'u1', word: 'mine' },
  { user_id: 'u2', word: 'theirs' },
]
const two = [gp('u1', 'me', 'red'), gp('u2', 'moth', 'blue')]

const setup = (over: Partial<Parameters<typeof useEventLogPlayerPicker>[0]> = {}) =>
  renderHook(() =>
    useEventLogPlayerPicker<Row>({
      players: two,
      selfId: 'u1',
      mode: 'compete',
      isTerminal: false,
      ...over,
    }),
  )

/**
 * The shared vocabulary (settled 2026-08-02): solo → your handle; co-op → Team
 * plus every player; compete → All plus every player. Named people are named by
 * HANDLE, including you — "You" made your own row read as a different kind of
 * thing from everyone else's.
 */
describe('useEventLogPlayerPicker — one vocabulary, every game', () => {
  it('compete lists All, then every player by handle', async () => {
    const { result } = setup()
    render(<>{result.current.dropdown}</>)
    expect(await filterOptions()).toEqual(['All', 'me', 'moth'])
  })

  it('co-op lists Team, then every player by handle', async () => {
    // Co-op used to collapse to Team ALONE. Per-player entries let you pull one
    // thread out of a shared log — "what did moth actually play?".
    const { result } = setup({ mode: 'coop' })
    render(<>{result.current.dropdown}</>)
    expect(await filterOptions()).toEqual(['Team', 'me', 'moth'])
  })

  it('a solo game is just the one handle — no aggregate', async () => {
    // "Team" of one, or "All" of one, would be the same list under two names.
    const { result } = setup({ mode: 'coop', players: [two[0]] })
    render(<>{result.current.dropdown}</>)
    expect(await filterOptions()).toEqual(['me'])
  })

  it('never labels the viewer "You"', async () => {
    const { result } = setup()
    render(<>{result.current.dropdown}</>)
    expect(await filterOptions()).not.toContain('You')
  })

  it('lists the viewer first, whatever order the players arrive in', async () => {
    const { result } = setup({ players: [two[1], two[0]] }) // deliberately not self-first
    render(<>{result.current.dropdown}</>)
    expect(await filterOptions()).toEqual(['All', 'me', 'moth'])
  })
})

describe('useEventLogPlayerPicker — the default selection', () => {
  it('co-op defaults to Team — the shared game is the whole point', () => {
    const { result } = setup({ mode: 'coop' })
    expect(result.current.picked).toBe('team')
    expect(result.current.showsEveryone).toBe(true)
    // Team shows EVERY row — the board is shared, so there's nothing to filter.
    expect(result.current.filter(rows)).toHaveLength(2)
  })

  it('compete defaults to my own board', () => {
    const { result } = setup()
    expect(result.current.picked).toBe('u1')
    expect(result.current.filter(rows).map((r) => r.word)).toEqual(['mine'])
  })

  it('re-derives once a LATE roster arrives', async () => {
    // The roster loads asynchronously, so the first render often has zero
    // players. A default frozen at mount would be `''` — an option that exists
    // nowhere — and the filter would then drop every row once the players
    // landed. (The codenamesduet-history.e2e flake this was found by.)
    function Probe({ players }: { players: typeof two }) {
      const picker = useEventLogPlayerPicker<Row>({
        players, selfId: 'u1', mode: 'coop', isTerminal: false,
      })
      return <p data-testid="rows">{picker.filter(rows).map((r) => r.word).join(',') || 'none'}</p>
    }
    const { rerender } = render(<Probe players={[]} />)
    // …and while the roster is still empty there's nobody to filter BY, so the
    // rows show rather than the log reading as "nothing happened here".
    expect(screen.getByTestId('rows')).toHaveTextContent('mine,theirs')
    rerender(<Probe players={two} />)
    expect(screen.getByTestId('rows')).toHaveTextContent('mine,theirs')
  })

  it('falls back when the picked player stops being offered', async () => {
    function Probe({ players }: { players: typeof two }) {
      const picker = useEventLogPlayerPicker<Row>({
        players, selfId: 'u1', mode: 'coop', isTerminal: false,
      })
      return (
        <>
          {picker.dropdown}
          <p data-testid="rows">{picker.filter(rows).map((r) => r.word).join(',') || 'none'}</p>
        </>
      )
    }
    const { rerender } = render(<Probe players={two} />)
    await pickFilter('moth')
    expect(screen.getByTestId('rows')).toHaveTextContent('theirs')
    // moth leaves → back to the default rather than an empty log forever.
    rerender(<Probe players={[two[0]]} />)
    expect(screen.getByTestId('rows')).toHaveTextContent('mine')
  })

  it('a spectator has no board of their own, so compete defaults to All', () => {
    const { result } = setup({ selfId: 'u9' })
    expect(result.current.picked).toBe('all')
    expect(result.current.filter(rows)).toHaveLength(2)
  })
})

describe('useEventLogPlayerPicker — the honest empty line', () => {
  function Probe({ isTerminal }: { isTerminal: boolean }) {
    const picker = useEventLogPlayerPicker<Row>({
      players: two,
      selfId: 'u1',
      mode: 'compete',
      isTerminal,
      emptyLabel: 'No guesses yet.',
    })
    return (<>{picker.dropdown}<p data-testid="empty">{picker.emptyText}</p></>)
  }

  it("says an opponent's empty log is HIDDEN mid-game, and empty at terminal", async () => {
    const { rerender } = render(<Probe isTerminal={false} />)
    // My own log: an honest "none yet".
    expect(screen.getByTestId('empty')).toHaveTextContent('No guesses yet.')

    await pickFilter('moth')
    expect(screen.getByTestId('empty')).toHaveTextContent('Hidden until game ends.')

    rerender(<Probe isTerminal={true} />)
    await pickFilter('moth')
    expect(screen.getByTestId('empty')).toHaveTextContent('No guesses yet.')
  })

  it('never calls the All view "hidden" — it always carries my own rows', async () => {
    render(<Probe isTerminal={false} />)
    await pickFilter('All')
    expect(screen.getByTestId('empty')).toHaveTextContent('No guesses yet.')
  })
})
