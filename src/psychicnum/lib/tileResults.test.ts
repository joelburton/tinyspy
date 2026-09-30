// cs-unmet

import { describe, expect, it } from 'vitest'
import { addRevealedSecrets } from './tileResults'

describe('addRevealedSecrets', () => {
  it('adds each undecided secret as a hit', () => {
    const board = new Map([['apple', false]])
    expect([...addRevealedSecrets(board, ['berry', 'cedar'])]).toEqual([
      ['apple', false], ['berry', true], ['cedar', true],
    ])
  })

  it('leaves a secret already decided as it is, and the board it was given alone', () => {
    const board = new Map([['berry', true]])
    const withRevealed = addRevealedSecrets(board, ['berry'])
    expect([...withRevealed]).toEqual([['berry', true]])
    expect(withRevealed).not.toBe(board)
  })
})
