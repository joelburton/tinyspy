// cs-blessed-codenamesduet

/**
 * THE INFO COLUMN'S DISCLOSURE (see InfoDisclosure.tsx): closed on every load,
 * its title the one line it claims, its children revealed on open — and a
 * click that toggles it without leaving focus on it. `SetupDisclosure.test.tsx`
 * pins the same through the "Setup options" list; this pins the shared half on
 * its own.
 */
import { fireEvent, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it } from 'vitest'
import { InfoDisclosure } from './InfoDisclosure'

const details = () => document.querySelector('details') as HTMLDetailsElement

describe('InfoDisclosure', () => {
  it('is closed on load, showing only its title', () => {
    render(<InfoDisclosure title="Key card"><p>inside</p></InfoDisclosure>)
    expect(details().open).toBe(false)
    expect(screen.getByText('Key card')).toBeInTheDocument()
  })

  it('opens and closes on its title', async () => {
    const user = userEvent.setup()
    render(<InfoDisclosure title="Key card"><p>inside</p></InfoDisclosure>)
    await user.click(screen.getByText('Key card'))
    expect(details().open).toBe(true)
    await user.click(screen.getByText('Key card'))
    expect(details().open).toBe(false)
  })

  it('cancels the mousedown, which is what would leave focus on it', () => {
    render(<InfoDisclosure title="Key card"><p>inside</p></InfoDisclosure>)
    expect(fireEvent.mouseDown(screen.getByText('Key card'))).toBe(false)
  })
})
