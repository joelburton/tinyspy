// cs-blessed-floating-panels

/**
 * Tests for the host's wiring: the question `askConfirmation` is asking gets
 * drawn, and each of the modal's answers settles the promise with the act it
 * names. Not a test of the modal — how `ConfirmationBlockingModal` lays out a
 * question is its own concern; this pins that the host passes the words through
 * and maps its buttons onto the three answers.
 */
import { act, render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { ConfirmationHost } from './ConfirmationHost'
import { askConfirmation } from './confirmationService'
import type { ConfirmAnswer, ConfirmOptions } from './confirmations'

const QUESTION: ConfirmOptions = {
  title: 'End this game?',
  message: 'This ends it for everyone.',
  confirmLabel: 'End game',
  cancelLabel: 'Keep playing',
}

/** Mount the host and ask; hands back the promise the asker is waiting on. */
function ask(opts: ConfirmOptions = QUESTION): Promise<ConfirmAnswer> {
  render(<ConfirmationHost />)
  let answer!: Promise<ConfirmAnswer>
  act(() => {
    answer = askConfirmation(opts)
  })
  return answer
}

async function click(name: string) {
  await act(async () => {
    screen.getByRole('button', { name }).click()
  })
}

describe('ConfirmationHost', () => {
  it('draws nothing until a question is asked', () => {
    const { container } = render(<ConfirmationHost />)
    expect(container.innerHTML).toBe('')
  })

  it('draws the pending question in its own words', () => {
    void ask()
    expect(screen.getByText('End this game?')).toBeInTheDocument()
    expect(screen.getByText('This ends it for everyone.')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'End game' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Keep playing' })).toBeInTheDocument()
  })

  it('the confirm button answers "confirm", and the question goes away', async () => {
    const answer = ask()
    await click('End game')
    await expect(answer).resolves.toBe('confirm')
    expect(screen.queryByText('End this game?')).toBeNull()
  })

  it('the cancel button answers no', async () => {
    const answer = ask()
    await click('Keep playing')
    await expect(answer).resolves.toBeNull()
  })

  it('offers a third button for a question with two ways to say yes, answering "alternative"', async () => {
    const answer = ask({
      title: 'Concede, or end the game?',
      message: 'Two endings.',
      confirmLabel: 'Concede',
      alternativeLabel: 'End for everyone',
    })
    expect(screen.getAllByRole('button')).toHaveLength(3)
    await click('End for everyone')
    await expect(answer).resolves.toBe('alternative')
  })

  it('draws only two buttons when the question has one way to say yes', () => {
    void ask()
    expect(screen.getAllByRole('button')).toHaveLength(2)
  })
})
