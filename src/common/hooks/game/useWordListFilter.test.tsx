/**
 * Tests for useWordListFilter — the word list's two-axis KIND/WHO filter.
 *
 * Like the turn log's picker, the vocabulary IS the feature, so most of these
 * assert the offered options themselves. The rest cover what a re-derivation gets
 * subtly wrong: which axis is gated and which isn't, the multi-finder match that
 * keeps compete honest, and an empty line that names whichever axis emptied the
 * list.
 */

import { render, renderHook, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it } from 'vitest'
import type { WordListRow } from '../../components/game/lists/WordList'
import { gp } from '../../test/gamePlayers'
import { useWordListFilter } from './useWordListFilter'

const found = (word: string, userId: string, extra: Partial<WordListRow> = {}): WordListRow =>
  ({ kind: 'found', word, userId, ...extra }) as WordListRow
const missed = (word: string, isBonus = false): WordListRow =>
  ({ kind: 'unfound', word, isBonus })

const two = [gp('u1', 'me', 'red'), gp('u2', 'moth', 'blue')]

/** Mid-game rows: only finds, no reveal yet. */
const playing: WordListRow[] = [
  found('bead', 'u1'),
  found('blag', 'u2', { isBonus: true }),
]
/** Post-terminal rows: the reveal has folded in, both kinds. */
const ended: WordListRow[] = [...playing, missed('bald'), missed('zho', true)]

const setup = (over: Partial<Parameters<typeof useWordListFilter>[0]> = {}) =>
  renderHook(() =>
    useWordListFilter({
      rows: ended,
      players: two,
      selfId: 'u1',
      isCompete: false,
      isTerminal: true,
      hasBonus: true,
      ...over,
    }),
  )

const optionsOf = (i: number) =>
  Array.from(screen.getAllByRole('combobox')[i].querySelectorAll('option')).map((o) => o.textContent)
const KIND = 0
const WHO = 1

describe('useWordListFilter — the two axes', () => {
  it('offers KIND then WHO, each a full enumeration', () => {
    const { result } = setup()
    render(<>{result.current.picker}</>)
    expect(optionsOf(KIND)).toEqual(['Legal', 'Required', 'Bonus'])
    expect(optionsOf(WHO)).toEqual(['All', 'Found', 'Missed', 'me', 'moth'])
  })

  it('defaults to Legal · All — the whole list', () => {
    const { result } = setup()
    expect(result.current.filter(ended)).toHaveLength(4)
  })

  it('drops the KIND select entirely on a board with no bonus list', () => {
    // boggle with legal_band === band: a lone "Legal" option would be a dead
    // control, and "Bonus" could never match.
    const { result } = setup({ hasBonus: false })
    render(<>{result.current.picker}</>)
    expect(screen.getAllByRole('combobox')).toHaveLength(1)
    expect(optionsOf(0)).toEqual(['All', 'Found', 'Missed', 'me', 'moth'])
  })

  it('names players by handle, including the viewer, self first', () => {
    // Same ruling as the turn log's picker: a list of handles is one list, where
    // labelling yourself "You" makes your own entry a different kind of thing.
    const { result } = setup({ players: [two[1], two[0]] }) // deliberately not self-first
    render(<>{result.current.picker}</>)
    expect(optionsOf(WHO)).toEqual(['All', 'Found', 'Missed', 'me', 'moth'])
  })
})

/**
 * KIND is ungated on purpose — it narrows whatever rows you can already see, and
 * "just my bonus words" is a fine question mid-game in either mode. WHO carries
 * every honesty rule instead.
 */
describe('useWordListFilter — what each axis gates on', () => {
  it('offers Found/Missed only once there is something missed to show', () => {
    const { result } = setup({ rows: playing })
    render(<>{result.current.picker}</>)
    // Mid-game every row is a find, so "Found" would be a second name for "All"
    // and "Missed" would resolve to nothing.
    expect(optionsOf(WHO)).toEqual(['All', 'me', 'moth'])
  })

  it('keeps the full KIND axis mid-game, in BOTH modes', () => {
    for (const isCompete of [false, true]) {
      const { result } = setup({ rows: playing, isTerminal: false, isCompete })
      const { unmount } = render(<>{result.current.picker}</>)
      expect(optionsOf(KIND)).toEqual(['Legal', 'Required', 'Bonus'])
      unmount()
    }
  })

  it('compete hides the per-player options until terminal — RLS hides peers', () => {
    const { result } = setup({ rows: playing, isCompete: true, isTerminal: false })
    render(<>{result.current.picker}</>)
    // Offering moth mid-game would be a menu entry for a guaranteed-empty list.
    expect(optionsOf(WHO)).toEqual(['All'])
  })

  it('compete offers everyone once the game ends', () => {
    const { result } = setup({ isCompete: true, isTerminal: true })
    render(<>{result.current.picker}</>)
    expect(optionsOf(WHO)).toEqual(['All', 'Found', 'Missed', 'me', 'moth'])
  })

  it('coop offers the per-player options from the start', () => {
    const { result } = setup({ rows: playing, isCompete: false, isTerminal: false })
    render(<>{result.current.picker}</>)
    expect(optionsOf(WHO)).toEqual(['All', 'me', 'moth'])
  })

  it('a solo game has nobody to pick between', () => {
    const { result } = setup({ rows: playing, players: [two[0]] })
    render(<>{result.current.picker}</>)
    expect(optionsOf(WHO)).toEqual(['All'])
  })
})

describe('useWordListFilter — filtering', () => {
  async function pick(axis: number, value: string) {
    await userEvent.setup().selectOptions(screen.getAllByRole('combobox')[axis], value)
  }
  function Probe(over: Partial<Parameters<typeof useWordListFilter>[0]> = {}) {
    const f = useWordListFilter({
      rows: ended, players: two, selfId: 'u1', isCompete: false, isTerminal: true, hasBonus: true, ...over,
    })
    const rows = (over.rows ?? ended) as WordListRow[]
    return (
      <>
        {f.picker}
        <p data-testid="rows">{f.filter(rows).map((r) => r.word).join(',') || 'none'}</p>
        <p data-testid="empty">{f.emptyText}</p>
      </>
    )
  }

  it('KIND narrows to one shipped list, across found AND missed', () => {
    render(<Probe />)
    expect(screen.getByTestId('rows')).toHaveTextContent('bead,blag,bald,zho')
  })

  it('Required keeps found + missed required words only', async () => {
    render(<Probe />)
    await pick(KIND, 'required')
    expect(screen.getByTestId('rows')).toHaveTextContent('bead,bald')
  })

  it('Bonus keeps found + missed bonus words only', async () => {
    render(<Probe />)
    await pick(KIND, 'bonus')
    expect(screen.getByTestId('rows')).toHaveTextContent('blag,zho')
  })

  it('the two axes compose — "moth’s bonus words"', async () => {
    // The whole reason this is two controls rather than one flat list.
    render(<Probe />)
    await pick(KIND, 'bonus')
    await pick(WHO, 'u2')
    expect(screen.getByTestId('rows')).toHaveTextContent('blag')
  })

  it('Missed keeps only the reveal rows; Found only the finds', async () => {
    render(<Probe />)
    await pick(WHO, 'missed')
    expect(screen.getByTestId('rows')).toHaveTextContent('bald,zho')
    await pick(WHO, 'found')
    expect(screen.getByTestId('rows')).toHaveTextContent('bead,blag')
  })

  it('a player filter matches EVERY finder, not just the attributed one', async () => {
    // Compete post-terminal: 'bead' is attributed to u2 (found first) but u1
    // found it too. Filtering to u1 must still show it — the dot's color is an
    // attribution choice, not a claim about who else got there.
    const shared: WordListRow[] = [found('bead', 'u2', { finderIds: ['u2', 'u1'] })]
    render(<Probe rows={shared} isCompete isTerminal />)
    await pick(WHO, 'u1')
    expect(screen.getByTestId('rows')).toHaveTextContent('bead')
  })

  it('falls back to the default when a selection stops being offered', async () => {
    // Rows reload without the reveal (a replay): "Missed" is no longer offered,
    // so the list degrades to All rather than filtering to nothing forever.
    function Wrap({ rows }: { rows: WordListRow[] }) {
      return <Probe rows={rows} />
    }
    const { rerender } = render(<Wrap rows={ended} />)
    await pick(WHO, 'missed')
    expect(screen.getByTestId('rows')).toHaveTextContent('bald,zho')
    rerender(<Wrap rows={playing} />)
    expect(screen.getByTestId('rows')).toHaveTextContent('bead,blag')
  })
})

/**
 * The empty line has to say WHICH axis emptied the list — "No words yet" reads as
 * "this game has no words" when really your filter matched none of them.
 */
describe('useWordListFilter — the empty line names the filter', () => {
  async function pick(axis: number, value: string) {
    await userEvent.setup().selectOptions(screen.getAllByRole('combobox')[axis], value)
  }
  function Probe() {
    const f = useWordListFilter({
      rows: ended, players: two, selfId: 'u1', isCompete: false, isTerminal: true, hasBonus: true,
    })
    return (<>{f.picker}<p data-testid="empty">{f.emptyText}</p></>)
  }

  it('says plain "No words yet" at the defaults', () => {
    render(<Probe />)
    expect(screen.getByTestId('empty')).toHaveTextContent('No words yet')
  })

  it('names the KIND', async () => {
    render(<Probe />)
    await pick(KIND, 'bonus')
    expect(screen.getByTestId('empty')).toHaveTextContent('No bonus words yet.')
  })

  it('names the player, by handle', async () => {
    render(<Probe />)
    await pick(WHO, 'u2')
    expect(screen.getByTestId('empty')).toHaveTextContent('Nothing from moth yet.')
  })

  it('names both when both are narrowed', async () => {
    render(<Probe />)
    await pick(KIND, 'required')
    await pick(WHO, 'u2')
    expect(screen.getByTestId('empty')).toHaveTextContent('No required words from moth yet.')
  })

  it('reads as an achievement for Missed, not an absence', async () => {
    render(<Probe />)
    await pick(WHO, 'missed')
    expect(screen.getByTestId('empty')).toHaveTextContent('Nothing missed.')
  })
})
