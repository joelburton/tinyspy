import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { CoopStyleField } from './CoopStyleField'
import type { Member } from '../../lib/games'

const ada: Member = { user_id: 'ada', username: 'ada', color: 'red' }
const bea: Member = { user_id: 'bea', username: 'bea', color: 'blue' }

describe('CoopStyleField', () => {
  it('renders nothing for compete', () => {
    const { container } = render(
      <CoopStyleField
        mode="compete"
        players={[ada, bea]}
        coopStyle="free-for-all"
        firstTurnUserId=""
        onChange={() => {}}
      />,
    )
    expect(container).toBeEmptyDOMElement()
  })

  it('renders nothing for a solo roster (1 player)', () => {
    const { container } = render(
      <CoopStyleField
        mode="coop"
        players={[ada]}
        coopStyle="free-for-all"
        firstTurnUserId=""
        onChange={() => {}}
      />,
    )
    expect(container).toBeEmptyDOMElement()
  })

  it('shows the style radios; the first-player picker only appears for turns', () => {
    const { rerender } = render(
      <CoopStyleField
        mode="coop"
        players={[ada, bea]}
        coopStyle="free-for-all"
        firstTurnUserId=""
        onChange={() => {}}
      />,
    )
    // Style choices are always present in coop/2+.
    expect(screen.getByRole('radio', { name: 'turns' })).toBeInTheDocument()
    expect(screen.getByRole('radio', { name: 'free-for-all' })).toBeInTheDocument()
    // Free-for-all: no first-player picker.
    expect(screen.queryByRole('radio', { name: 'ada' })).not.toBeInTheDocument()

    // Turns: the first-player picker (one radio per selected player) appears.
    rerender(
      <CoopStyleField
        mode="coop"
        players={[ada, bea]}
        coopStyle="turns"
        firstTurnUserId="ada"
        onChange={() => {}}
      />,
    )
    expect(screen.getByRole('radio', { name: 'ada' })).toBeInTheDocument()
    expect(screen.getByRole('radio', { name: 'bea' })).toBeInTheDocument()
  })

  it('bakes the live value into the disclosure summary', () => {
    const { rerender } = render(
      <CoopStyleField
        mode="coop"
        players={[ada, bea]}
        coopStyle="free-for-all"
        firstTurnUserId=""
        onChange={() => {}}
      />,
    )
    expect(screen.getByText('Co-op: free-for-all')).toBeInTheDocument()
    rerender(
      <CoopStyleField
        mode="coop"
        players={[ada, bea]}
        coopStyle="turns"
        firstTurnUserId="ada"
        onChange={() => {}}
      />,
    )
    expect(screen.getByText('Co-op: turns (ada first)')).toBeInTheDocument()
  })

  it('emits both keys when the style changes', async () => {
    const onChange = vi.fn()
    render(
      <CoopStyleField
        mode="coop"
        players={[ada, bea]}
        coopStyle="free-for-all"
        firstTurnUserId=""
        onChange={onChange}
      />,
    )
    await userEvent.click(screen.getByRole('radio', { name: 'turns' }))
    expect(onChange).toHaveBeenCalledWith({ coopStyle: 'turns', firstTurnUserId: '' })
  })

  it('seeds the first player to players[0] when turns is on and none is chosen', () => {
    const onChange = vi.fn()
    render(
      <CoopStyleField
        mode="coop"
        players={[ada, bea]}
        coopStyle="turns"
        firstTurnUserId=""
        onChange={onChange}
      />,
    )
    // The seed effect fires on mount because firstTurnUserId isn't a selected player.
    expect(onChange).toHaveBeenCalledWith({ coopStyle: 'turns', firstTurnUserId: 'ada' })
  })

  it('re-seeds when the chosen first player is deselected', () => {
    const onChange = vi.fn()
    // ada was the first player but has been unchecked; the roster is now
    // bea + cade. The seed effect re-picks the first still-selected player.
    render(
      <CoopStyleField
        mode="coop"
        players={[bea, { user_id: 'cade', username: 'cade', color: 'green' }]}
        coopStyle="turns"
        firstTurnUserId="ada"
        onChange={onChange}
      />,
    )
    expect(onChange).toHaveBeenCalledWith({ coopStyle: 'turns', firstTurnUserId: 'bea' })
  })
})
