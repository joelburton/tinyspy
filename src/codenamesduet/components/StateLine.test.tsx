// cs-blessed-codenamesduet

import { render } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { StateLine } from './StateLine'

const NO_BOARD = { tiles: [], tilesById: new Map() }

const line = (nTurnsUsed: number, suddenDeath = false) =>
  render(
    <StateLine facts={{ nFoundAgents: 3, nTurnsUsed, maxTurns: 9, suddenDeath, board: NO_BOARD }} />,
  ).container.textContent

describe('codenamesduet StateLine', () => {
  it('counts the turns spent against the budget', () => {
    expect(line(3)).toBe('3/15 agents · 3/9 turns spent')
    expect(line(9)).toBe('3/15 agents · 9/9 turns spent')
  })

  it('says sudden death once the budget is spent, never "11/9"', () => {
    expect(line(9, true)).toBe('3/15 agents · sudden death')
  })
})
