// cs-unmet

/**
 * THE SETUP RECAP SHOWN WHILE PLAYING (see SetupDisclosure.tsx) — the
 * info-column "Setup options" list, not a setup form.
 *
 * Only the name links it to `<SetupSection>`: that one wraps a field you are
 * editing before the game starts, this one recaps the settings afterwards and
 * lives on the play surface. It exists so sixteen info columns don't each
 * re-author the same `<details>`, so what is worth holding is that the wrapper
 * is the same for all of them and the rows are the caller's.
 */
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it } from 'vitest'
import { SetupDisclosure } from './SetupDisclosure'

describe('SetupDisclosure', () => {
  it('is closed while you play, because the board is what you are looking at', () => {
    render(<SetupDisclosure><li>Timer: none</li></SetupDisclosure>)
    expect((document.querySelector('details') as HTMLDetailsElement).open).toBe(false)
  })

  it('opens on the summary every game shares', async () => {
    const user = userEvent.setup()
    render(<SetupDisclosure><li>Timer: none</li></SetupDisclosure>)

    await user.click(screen.getByText('Setup options'))

    expect((document.querySelector('details') as HTMLDetailsElement).open).toBe(true)
  })

  it('puts the rows in a list, which is why a caller passes <li>s', () => {
    render(
      <SetupDisclosure>
        <li>Timer: none</li>
        <li>Dictionary: Familiar</li>
      </SetupDisclosure>,
    )
    expect(document.querySelectorAll('ul > li')).toHaveLength(2)
  })
})
