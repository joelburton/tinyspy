// cs-blessed-setup-form

/**
 * THE SETUP RECAP SHOWN WHILE PLAYING (see SetupDisclosure.tsx) — the
 * info-column "Setup options" list, not a setup form.
 *
 * Only the name links it to `<SetupSection>`: that one wraps a field you are
 * editing before the game starts, this one recaps the settings afterwards and
 * lives on the play surface. It exists so every game's info column doesn't
 * re-author the same `<details>`, so what is worth holding is that a game hands
 * over rows and gets the whole list back.
 */
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it } from 'vitest'
import { SetupDisclosure } from './SetupDisclosure'
import type { SetupRow } from './setupRows'

const ROWS: SetupRow[] = [
  { key: 'timer', label: 'Timer', value: 'none' },
  { key: 'dictionary', label: 'Dictionary', value: 'Familiar' },
]

describe('SetupDisclosure', () => {
  it('is closed while you play, because the board is what you are looking at', () => {
    render(<SetupDisclosure rows={ROWS} />)
    expect((document.querySelector('details') as HTMLDetailsElement).open).toBe(false)
  })

  it('opens on the summary every game shares', async () => {
    const user = userEvent.setup()
    render(<SetupDisclosure rows={ROWS} />)

    await user.click(screen.getByText('Setup options'))

    expect((document.querySelector('details') as HTMLDetailsElement).open).toBe(true)
  })

  it('draws one list item per row, "label: value"', () => {
    render(<SetupDisclosure rows={ROWS} />)

    const items = document.querySelectorAll('ul > li')
    expect(items).toHaveLength(2)
    expect(items[0].textContent).toBe('Timer: none')
    expect(items[1].textContent).toBe('Dictionary: Familiar')
  })
})
