// cs-blessed-info-sheet

import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { TurnStatusLine } from './TurnStatusLine'
import type { Player } from '../members/member'

const bea: Player = { id: 'bea', username: 'bea', color: 'blue' }

describe('TurnStatusLine', () => {
  it('says "Your turn" when the move is mine', () => {
    render(<TurnStatusLine turnHolder={bea} isMyTurn isGameEnded={false} />)
    expect(screen.getByText('Your turn')).toBeInTheDocument()
    expect(screen.queryByText(/Waiting for/)).not.toBeInTheDocument()
  })

  it('names the holder when it is a teammate’s turn', () => {
    render(<TurnStatusLine turnHolder={bea} isMyTurn={false} isGameEnded={false} />)
    expect(screen.getByText(/Waiting for/)).toBeInTheDocument()
    expect(screen.getByText(/bea/)).toBeInTheDocument()
  })

  it('goes empty once the game has ended (no "Your turn" / "Waiting for" nag)', () => {
    const { container } = render(<TurnStatusLine turnHolder={bea} isMyTurn={false} isGameEnded />)
    expect(screen.queryByText('Your turn')).not.toBeInTheDocument()
    expect(screen.queryByText(/Waiting for/)).not.toBeInTheDocument()
    // The line is still there, empty, to keep its height.
    expect(container.firstElementChild).toBeEmptyDOMElement()
  })
})
