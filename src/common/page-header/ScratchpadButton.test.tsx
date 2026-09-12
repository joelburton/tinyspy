// cs-blessed-page-header

/**
 * The scratchpad mark is an action surface like the pause mark: it says which
 * action it is, its words follow the panel, and its bubble carries the key.
 */
import { act, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it } from 'vitest'
import { getScratchpadOpen, setScratchpadOpen } from '../scratchpad/scratchpadOpenStore'
import { ScratchpadButton } from './ScratchpadButton'

beforeEach(() => {
  setScratchpadOpen(false)
})

describe('ScratchpadButton', () => {
  it('is the scratchpad action, and its bubble says the key', () => {
    render(<ScratchpadButton />)
    const mark = screen.getByRole('button', { name: 'Open scratchpad' })
    expect(mark.dataset.action).toBe('act-open-scratchpad')
    expect(mark.dataset.tooltip).toBe('Open scratchpad · ⌥S')
  })

  it('wears the other face while the panel is open', () => {
    render(<ScratchpadButton />)
    act(() => setScratchpadOpen(true))
    const mark = screen.getByRole('button', { name: 'Close scratchpad' })
    expect(mark.getAttribute('aria-pressed')).toBe('true')
  })

  it('toggles the panel on click', async () => {
    const user = userEvent.setup()
    render(<ScratchpadButton />)
    await user.click(screen.getByRole('button', { name: 'Open scratchpad' }))
    expect(getScratchpadOpen()).toBe(true)
    await user.click(screen.getByRole('button', { name: 'Close scratchpad' }))
    expect(getScratchpadOpen()).toBe(false)
  })
})
