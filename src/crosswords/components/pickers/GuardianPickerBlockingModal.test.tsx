// cs-unmet

/**
 * The Guardian picker — the series IS the choice.
 *
 * Only today's puzzle exists for a series, so there is nothing further to pick
 * and Enter on a row starts a game. The hints are the whole basis for choosing
 * (Quick and Speedy are plain-definition puzzles; the rest are cryptics), which
 * is why this is a list rather than the `<select>` + one hint line it replaces:
 * a dropdown can only describe the row you are already standing on.
 */
import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { GuardianPickerBlockingModal } from './GuardianPickerBlockingModal'
import { GUARDIAN_SERIES } from '../../lib/setup'

// jsdom doesn't implement scrollIntoView, and SelectionList keeps the cursor
// row in view with it.
Element.prototype.scrollIntoView = vi.fn()

const onPick = vi.fn()
const onClose = vi.fn()

const draw = () => render(<GuardianPickerBlockingModal onPick={onPick} onClose={onClose} />)

beforeEach(() => {
  onPick.mockReset()
  onClose.mockReset()
})

describe('the Guardian picker', () => {
  it('offers every series the FE picks from, each with its character', () => {
    // Scoped to the LIST: the lead paragraph names Quick and Speedy too, in
    // <strong>, and an unscoped search would match those instead.
    draw()
    const list = within(screen.getByRole('group', { name: 'Guardian series' }))
    for (const g of GUARDIAN_SERIES) {
      expect(list.getByText(g.label)).toBeInTheDocument()
      expect(list.getByText(g.hint)).toBeInTheDocument()
    }
  })

  it('hands back the SLUG, which is what create_game reads', async () => {
    // Not the label: `setup.series` is the slug, and the edge function's own
    // allowlist is keyed on it.
    const user = userEvent.setup()
    draw()

    await user.click(screen.getByText('Quiptic'))

    expect(onPick).toHaveBeenCalledWith('quiptic')
  })

  it('picks with RETURN, the same as a click', async () => {
    const user = userEvent.setup()
    draw()

    screen.getByRole('group', { name: 'Guardian series' }).focus()
    await user.keyboard('{Enter}')

    expect(onPick).toHaveBeenCalledWith(GUARDIAN_SERIES[0]!.slug)
  })

  it('cancels without picking', async () => {
    const user = userEvent.setup()
    draw()

    await user.click(screen.getByRole('button', { name: 'Cancel' }))

    expect(onClose).toHaveBeenCalled()
    expect(onPick).not.toHaveBeenCalled()
  })
})
