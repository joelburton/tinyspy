import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { TurnStatusLine } from './TurnStatusLine'
import type { Member } from '../../lib/games'

const ada: Member = { user_id: 'ada', username: 'ada', color: 'red' }
const bea: Member = { user_id: 'bea', username: 'bea', color: 'blue' }
const players = [ada, bea]

describe('TurnStatusLine', () => {
  it('says "Your turn" when the pointer is the viewer', () => {
    render(
      <TurnStatusLine
        currentTurnUserId="ada"
        players={players}
        selfId="ada"
        isTerminal={false}
      />,
    )
    expect(screen.getByText('Your turn')).toBeInTheDocument()
    expect(screen.queryByText(/Waiting for/)).not.toBeInTheDocument()
  })

  it('names the current player when it is a teammate’s turn', () => {
    render(
      <TurnStatusLine
        currentTurnUserId="bea"
        players={players}
        selfId="ada"
        isTerminal={false}
      />,
    )
    expect(screen.getByText(/Waiting for/)).toBeInTheDocument()
    expect(screen.getByText(/bea/)).toBeInTheDocument()
  })

  it('falls back to "someone" for an unknown pointer', () => {
    render(
      <TurnStatusLine
        currentTurnUserId="ghost"
        players={players}
        selfId="ada"
        isTerminal={false}
      />,
    )
    expect(screen.getByText(/someone/)).toBeInTheDocument()
  })

  it('goes inert at terminal (no "Your turn" / "Waiting for" nag)', () => {
    render(
      <TurnStatusLine
        currentTurnUserId="bea"
        players={players}
        selfId="ada"
        isTerminal
      />,
    )
    expect(screen.queryByText('Your turn')).not.toBeInTheDocument()
    expect(screen.queryByText(/Waiting for/)).not.toBeInTheDocument()
  })
})
