// cs-unmet

/**
 * The NYT picker — two ways in, and they are not equals.
 *
 * The WEEKDAY is the normal path, because an NYT crossword's day is its
 * difficulty. The DATE is an override for "we want that exact one". They answer
 * the same question, so exactly one can be set, and the tests below are mostly
 * about that: choosing either must clear the other, or the control you did not
 * use goes silently inert.
 *
 * What is NOT here is which date a weekday resolves to. That depends on the
 * player set, which lives in the setup form — `PuzzleSourceField` owns the
 * lookup and re-asks when the players change, so a date cannot go stale inside
 * a modal that has closed.
 */
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { NytPickerBlockingModal } from './NytPickerBlockingModal'

// jsdom doesn't implement scrollIntoView, and SelectionList keeps the cursor
// row in view with it.
Element.prototype.scrollIntoView = vi.fn()

const onPick = vi.fn()
const onClose = vi.fn()

const draw = () => render(<NytPickerBlockingModal onPick={onPick} onClose={onClose} />)

beforeEach(() => {
  onPick.mockReset()
  onClose.mockReset()
})

describe('the NYT picker', () => {
  it('offers all seven days with what each one is LIKE', () => {
    // The notes are why this is a list rather than the <select> it replaces: a
    // dropdown shows the difficulty of the row you are already standing on.
    draw()
    expect(screen.getByText('Monday')).toBeInTheDocument()
    expect(screen.getByText('easiest')).toBeInTheDocument()
    expect(screen.getByText('Saturday')).toBeInTheDocument()
    expect(screen.getByText('hardest')).toBeInTheDocument()
    expect(screen.getByText('Sunday')).toBeInTheDocument()
  })

  it('picks a weekday by its Postgres dow, and sends no date with it', async () => {
    // The number goes straight to next_nyt_date_for_club(seen_by, dow), so
    // Sunday must be 0 — not the seventh row's index.
    const user = userEvent.setup()
    draw()

    await user.click(screen.getByText('Sunday'))

    expect(onPick).toHaveBeenCalledWith({ weekday: 0 })
  })

  it('picks with RETURN, the same as a click', async () => {
    const user = userEvent.setup()
    draw()

    screen.getByRole('group', { name: 'Weekday' }).focus()
    await user.keyboard('{Enter}')

    expect(onPick).toHaveBeenCalledWith({ weekday: 1 })
  })

  it('takes an exact date instead, sending no weekday with it', async () => {
    const user = userEvent.setup()
    draw()

    const box = screen.getByLabelText('Puzzle date')
    await user.type(box, '2026-08-24')
    await user.type(box, '{Enter}')

    expect(onPick).toHaveBeenCalledWith({ date: '2026-08-24' })
  })

  it('ignores Return in an empty date box rather than choosing nothing', async () => {
    const user = userEvent.setup()
    draw()

    await user.type(screen.getByLabelText('Puzzle date'), '{Enter}')

    expect(onPick).not.toHaveBeenCalled()
  })

  it('bounds the date box to the archive we actually reach', () => {
    // A box you can page back thirty years in is a worse tool than a bounded
    // one, and the weekday walk stops at the same place.
    expect(screen.queryByLabelText('Puzzle date')).toBeNull()
    draw()
    expect(screen.getByLabelText('Puzzle date')).toHaveAttribute('min', '2015-01-01')
  })

  it('cancels without picking', async () => {
    const user = userEvent.setup()
    draw()

    await user.click(screen.getByRole('button', { name: 'Cancel' }))

    expect(onClose).toHaveBeenCalled()
    expect(onPick).not.toHaveBeenCalled()
  })
})
