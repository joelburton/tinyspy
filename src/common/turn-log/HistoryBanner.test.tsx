// cs-blessed-turn-log

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
