// cs-unmet

import { describe, expect, it } from 'vitest'
import { addRevealedSecrets } from './addRevealedSecrets'
import type { GTile } from '../types'

const undecided = (word: string): GTile => ({ id: word, word, correct: null, outcome: null, decidedBy: null })

describe('addRevealedSecrets', () => {
  it('turns each undecided secret into a hit, with no decider', () => {
    const board = [{ ...undecided('apple'), correct: false, outcome: 'lost' }, undecided('berry'), undecided('cedar')] as GTile[]
    expect(addRevealedSecrets(board, ['berry', 'cedar'])).toEqual([
      { id: 'apple', word: 'apple', correct: false, outcome: 'lost', decidedBy: null },
      { id: 'berry', word: 'berry', correct: true, outcome: 'won', decidedBy: null },
      { id: 'cedar', word: 'cedar', correct: true, outcome: 'won', decidedBy: null },
    ])
  })

  it('leaves a secret already decided as it is, and the board it was given alone', () => {
    const found = { id: 'berry', word: 'berry', correct: true, outcome: 'won', decidedBy: null } as GTile
    const board = [found]
    const withRevealed = addRevealedSecrets(board, ['berry'])
    expect(withRevealed[0]).toBe(found)
    expect(withRevealed).not.toBe(board)
  })
})
