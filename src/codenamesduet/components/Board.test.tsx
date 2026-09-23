// cs-met-codenamesduet

/**
 * The board's per-seat bystander lock: a word I hit as a bystander is closed
 * to me, and one my partner hit stays open — it may be my agent.
 */
import { render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { Board } from './Board'
import type { Seat } from '../lib/phase'

// Position 0 was hit as a bystander by seat A, position 1 by seat B.
const words = Array.from({ length: 25 }, (_, i) => ({
  position: i,
  word: i === 0 ? 'apple' : i === 1 ? 'berry' : `word${i}`,
  revealed_as: null,
  neutral_a: i === 0,
  neutral_b: i === 1,
}))

function draw(mySeat: Seat) {
  render(
    <Board
      words={words}
      myKey={Array.from({ length: 25 }, () => 'N' as const)}
      peerKey={null}
      mySeat={mySeat}
      gameOver={false}
      cellsClickable
      pendingPos={null}
      onGuess={vi.fn()}
    />,
  )
}

describe('codenamesduet Board — the per-seat bystander lock', () => {
  it('as seat A: my bystander is closed, my partner’s is open', () => {
    draw('A')
    expect(screen.getByRole('button', { name: /apple/i })).toBeDisabled()
    expect(screen.getByRole('button', { name: /berry/i })).toBeEnabled()
  })

  it('as seat B: the same, the other way round', () => {
    draw('B')
    expect(screen.getByRole('button', { name: /berry/i })).toBeDisabled()
    expect(screen.getByRole('button', { name: /apple/i })).toBeEnabled()
  })
})
