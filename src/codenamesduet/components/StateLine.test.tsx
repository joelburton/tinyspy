// cs-blessed-codenamesduet

import { render } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { StateLine } from './StateLine'

const line = (turnNumber: number) =>
  render(<StateLine greenFound={3} turnNumber={turnNumber} turns={9} />).container.textContent

describe('codenamesduet StateLine', () => {
  it('counts the turns SPENT, the last ordinary turn included', () => {
    expect(line(4)).toBe('3/15 agents · 3/9 turns spent')
    expect(line(9)).toBe('3/15 agents · 8/9 turns spent')
  })

  // Past the budget is sudden death, live or after the game it ended — the
  // turn number keeps climbing there, and must never read "11/9".
  it('says sudden death once the budget is spent, however far past it', () => {
    expect(line(10)).toBe('3/15 agents · sudden death')
    expect(line(12)).toBe('3/15 agents · sudden death')
  })
})
