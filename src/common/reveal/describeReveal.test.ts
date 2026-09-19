// cs-audited-reveal

import { describe, expect, it } from 'vitest'
import { describeReveal } from './describeReveal'

/**
 * The three faces of every game's `act-reveal`, in one place because they used
 * to be ten hand-written copies — which is how five games ended up without the
 * tooltip while `docs/ui.md` stated it as the rule.
 */
describe('describeReveal', () => {
  it('names the noun in both live faces, and wears the crossed eye only to hide', () => {
    const hidden = describeReveal({ noun: 'solution', revealed: false, isTerminal: true })
    const shown = describeReveal({ noun: 'solution', revealed: true, isTerminal: true })
    expect(hidden).toMatchObject({ state: 'active', label: 'Reveal solution' })
    expect(hidden.icon).toBeUndefined()
    expect(shown).toMatchObject({ state: 'active', label: 'Hide solution' })
    expect(shown.icon).toBeTruthy()
  })

  /**
   * Named in the inert case too — a bare "Reveal" would let the row change its
   * words as the game ended — and tooltipped, because a gray control that says
   * nothing about why is the thing this function exists to stop repeating.
   */
  it('grays before terminal, keeping its name and saying why', () => {
    expect(describeReveal({ noun: 'key cards', revealed: false, isTerminal: false })).toEqual({
      state: 'disabled',
      label: 'Reveal key cards',
      tooltip: "Can't reveal until all end",
    })
  })

  it('goes inert once a solve has already put it on screen, whatever the noun', () => {
    // The one label that is NOT built from the noun: there is no control left to
    // describe, so it says what happened rather than what it would do.
    expect(describeReveal({ noun: 'best solution', revealed: true, impliedBySolve: true, isTerminal: true }))
      .toEqual({ state: 'disabled', label: 'Solution already shown' })
  })

  it('omitting impliedBySolve is the four games that never imply', () => {
    expect(describeReveal({ noun: 'solution', revealed: true, isTerminal: true }).state).toBe('active')
  })
})
