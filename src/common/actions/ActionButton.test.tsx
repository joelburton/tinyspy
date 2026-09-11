// cs-audited-actions

/**
 * Tests for the one action button: that it draws what the action says, that a
 * hidden action draws nothing, and that its bubble teaches the key.
 *
 * Mounted against a REAL bound action rather than a hand-made object, so what
 * is tested is the pair as a caller uses it.
 */
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { ActionButton } from './ActionButton'
import { useBoundAction, type ActionState, type LiveAction } from './useBoundAction'
import type { ActionId } from './registry'

/** A component that binds one action and draws its button. */
function Harness({ id, live, show = 'label' as const }: { id: ActionId; live: Partial<LiveAction>; show?: 'icon' | 'label' | 'both' }) {
  const action = useBoundAction(id, { run: () => undefined, describe: () => 'active' as ActionState, ...live })
  return <ActionButton action={action} show={show} />
}

describe('ActionButton', () => {
  it("draws the action's own words", () => {
    render(<Harness id="act-new-game" live={{}} />)
    expect(screen.getByRole('button', { name: /new game/i })).toBeTruthy()
  })

  it('prefers the words the action says right now', () => {
    render(<Harness id="act-submit" live={{ describe: () => ({ state: 'active', label: 'Submit · 24' }) }} />)
    expect(screen.getByRole('button', { name: /submit · 24/i })).toBeTruthy()
  })

  it('draws nothing at all when the action is hidden', () => {
    const { container } = render(<Harness id="act-new-game" live={{ describe: () => 'hidden' as ActionState }} />)
    expect(container.innerHTML).toBe('')
  })

  it('disables itself when the action is disabled', () => {
    render(<Harness id="act-new-game" live={{ describe: () => 'disabled' as ActionState }} />)
    expect(screen.getByRole('button', { name: /new game/i }).hasAttribute('disabled')).toBe(true)
  })

  it('says the key in its hover bubble', () => {
    render(<Harness id="act-new-game" live={{}} />)
    expect(screen.getByRole('button', { name: /new game/i }).dataset.tooltip).toBe('New game · +')
  })

  it("puts the action's reason in the bubble, in place of the name and key", () => {
    // The words stay the action's — the reason is WHY it is in this state,
    // and it comes from the binding, not the placement.
    render(<Harness id="act-shuffle" live={{ describe: () => ({ state: 'disabled', tooltip: 'Nothing to shuffle yet' }) }} />)
    const button = screen.getByRole('button', { name: /shuffle/i })
    expect(button.dataset.tooltip).toBe('Nothing to shuffle yet')
    expect(button.getAttribute('aria-label')).toBe('Shuffle')
  })

  it('says which action it is, for a stylesheet or a test to find', () => {
    render(<Harness id="act-shuffle" live={{}} />)
    expect(document.querySelector('[data-action="act-shuffle"]')).toBeTruthy()
  })

  it('shows the key beside the name, wherever a control asks for it', () => {
    // The same helper the round shuffle pill uses, so a bespoke control and a
    // standard one say the key one way.
    render(<Harness id="act-shuffle" live={{}} />)
    expect(screen.getByRole('button', { name: /shuffle/i }).dataset.tooltip).toBe('Shuffle · ⌥Z')
  })

  it('runs the action when clicked', async () => {
    const run = vi.fn()
    render(<Harness id="act-shuffle" live={{ run }} />)
    await userEvent.click(screen.getByRole('button', { name: /shuffle/i }))
    expect(run).toHaveBeenCalledTimes(1)
  })
})
