// cs-blessed-event-log

/**
 * Tests for <HistoryBanner> — the viewer's "you are looking at a past turn" strip.
 *
 * Its whole contract is three things, and the ✕ is the one nothing else covers:
 * the `*-history.e2e.ts` specs exercise the keystroke and the click-away exits,
 * and none of them clicks the ✕.
 */

import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { HistoryBanner } from './HistoryBanner'

describe('HistoryBanner', () => {
  it('shows the label it is given, markup included', () => {
    render(<HistoryBanner label={<em>Cleared CLEAR</em>} onExit={() => {}} />)

    expect(screen.getByText('Cleared CLEAR').tagName).toBe('EM')
  })

  it("names the actor before the label when the board is someone else's", () => {
    // Compete at terminal: a `#N` on an opponent's row replays THEIR board, so
    // the banner has to say whose it is. "moth: GUESS 3" — never "moth's board".
    render(
      <HistoryBanner label="GUESS 3" actor={{ username: 'moth', color: 'teal' }} onExit={() => {}} />,
    )

    expect(screen.getByText('moth')).toBeInTheDocument()
    expect(screen.getByText(/GUESS 3/)).toBeInTheDocument()
    expect(document.querySelector('[data-history-banner]')?.textContent).toBe('moth: GUESS 3✕')
  })

  it('names nobody when the board on screen is the viewer\'s own', () => {
    render(<HistoryBanner label="GUESS 3" onExit={() => {}} />)

    expect(document.querySelector('[data-history-banner]')?.textContent).toBe('GUESS 3✕')
  })

  it('exits when the banner itself is clicked — the whole strip is the target', async () => {
    const onExit = vi.fn()
    render(<HistoryBanner label="Cleared CLEAR" onExit={onExit} />)

    await userEvent.click(screen.getByText('Cleared CLEAR'))

    expect(onExit).toHaveBeenCalledTimes(1)
  })

  it('exits ONCE when the ✕ is clicked, not twice through the banner behind it', async () => {
    const onExit = vi.fn()
    render(<HistoryBanner label="Cleared CLEAR" onExit={onExit} />)

    await userEvent.click(screen.getByRole('button', { name: 'Exit history' }))

    expect(onExit).toHaveBeenCalledTimes(1)
  })
})
