// cs-unmet

/**
 * A COLLAPSIBLE SETTING (see SetupSection.tsx) — and the one rule in it that is
 * easy to get wrong and invisible when you do.
 *
 * `defaultOpen` is a DEFAULT, not a controlled value. It can go false again
 * while the section is open — `<SetupNextPuzzleSection>` sets it from "there is
 * nothing to play", which flips back the moment you type a date that has
 * something — and the box you are typing into is inside the section. Forcing it
 * shut yanks the control out from under the cursor.
 */
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it } from 'vitest'
import { SetupSection } from './SetupSection'

const openness = () => (document.querySelector('details') as HTMLDetailsElement).open

describe('SetupSection', () => {
  it('is closed by default, because the summary already carries the value', () => {
    render(<SetupSection label="Timer: none">the controls</SetupSection>)
    expect(openness()).toBe(false)
  })

  it('opens when asked', () => {
    render(<SetupSection label="Players" defaultOpen>the controls</SetupSection>)
    expect(openness()).toBe(true)
  })

  it('opens when the reason to open arrives LATE', () => {
    // The reason often arrives on an RPC, after mount.
    const { rerender } = render(<SetupSection label="Puzzle">the controls</SetupSection>)
    expect(openness()).toBe(false)

    rerender(<SetupSection label="Puzzle" defaultOpen>the controls</SetupSection>)
    expect(openness()).toBe(true)
  })

  it('does NOT slam shut when that reason goes away again', () => {
    // The section is open and someone is typing in it. `defaultOpen` going
    // false is not an instruction to close.
    const { rerender } = render(
      <SetupSection label="Puzzle" defaultOpen>the controls</SetupSection>,
    )
    rerender(<SetupSection label="Puzzle">the controls</SetupSection>)

    expect(openness()).toBe(true)
  })

  it('lets the reader close one they opened themselves', async () => {
    const user = userEvent.setup()
    render(<SetupSection label="Timer: none">the controls</SetupSection>)

    await user.click(screen.getByText('Timer: none'))
    expect(openness()).toBe(true)
    await user.click(screen.getByText('Timer: none'))
    expect(openness()).toBe(false)
  })

  it('draws its help above the controls, and nothing when there is none', () => {
    const { rerender } = render(
      <SetupSection label="Dictionaries" help="Both are length-agnostic.">
        <span>the controls</span>
      </SetupSection>,
    )
    expect(screen.getByText('Both are length-agnostic.')).toBeInTheDocument()

    rerender(<SetupSection label="Dictionaries"><span>the controls</span></SetupSection>)
    expect(screen.queryByText('Both are length-agnostic.')).not.toBeInTheDocument()
  })
})
