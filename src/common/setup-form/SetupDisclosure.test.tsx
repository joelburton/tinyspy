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
import { fireEvent, render, screen } from '@testing-library/react'
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

  /**
   * A click must not leave focus on the summary — the reason is the component's
   * docstring, and it is a key the game wanted rather than an outline.
   *
   * **jsdom cannot see the behavior**: it does not treat `<summary>` as
   * focusable at all, so a click leaves `document.activeElement` on `<body>`
   * with or without the fix. Asserting that would be a test that passes for the
   * wrong reason — it does, and planting proved it. So what is pinned here is
   * the MECHANISM (the mousedown is canceled) and the half it must not break
   * (the pointer still toggles it). Whether a given browser then withholds
   * focus is that browser's, and is checked by hand.
   */
  it('cancels the mousedown, which is the default action that gives it focus', () => {
    render(<SetupDisclosure rows={ROWS} />)

    const notCanceled = fireEvent.mouseDown(screen.getByText('Setup options'))

    expect(notCanceled).toBe(false)
  })

  it('still toggles by pointer, which is the only way it is operated', async () => {
    // The half canceling `mousedown` must not break: focus is that event's
    // default action, the toggle is the click's activation behavior.
    const user = userEvent.setup()
    render(<SetupDisclosure rows={ROWS} />)
    const details = document.querySelector('details') as HTMLDetailsElement

    await user.click(screen.getByText('Setup options'))
    expect(details.open).toBe(true)
    await user.click(screen.getByText('Setup options'))
    expect(details.open).toBe(false)
  })

  it('draws one list item per row, "label: value"', () => {
    render(<SetupDisclosure rows={ROWS} />)

    const items = document.querySelectorAll('ul > li')
    expect(items).toHaveLength(2)
    expect(items[0].textContent).toBe('Timer: none')
    expect(items[1].textContent).toBe('Dictionary: Familiar')
  })
})
