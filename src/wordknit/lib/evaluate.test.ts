import { describe, expect, it } from 'vitest'
import { evaluateGuess, sameTileSet } from './evaluate'
import type { Group } from './board'

const GROUPS: Group[] = [
  { level: 0, group: 'A-words', members: ['ALPHA', 'ANGEL', 'APPLE', 'ARROW'] },
  { level: 1, group: 'B-words', members: ['BANANA', 'BIRCH', 'BREAD', 'BRICK'] },
  { level: 2, group: 'C-words', members: ['CASTLE', 'CIRCLE', 'CLOUD', 'CROWN'] },
  { level: 3, group: 'D-words', members: ['DAGGER', 'DELTA', 'DIAMOND', 'DRAGON'] },
]

describe('evaluateGuess', () => {
  it('returns correct with level + members for a 4-of-4 match', () => {
    const result = evaluateGuess(['ALPHA', 'ANGEL', 'APPLE', 'ARROW'], GROUPS)
    expect(result.kind).toBe('correct')
    if (result.kind === 'correct') {
      expect(result.level).toBe(0)
      expect(result.group).toBe('A-words')
      expect(result.members).toEqual(['ALPHA', 'ANGEL', 'APPLE', 'ARROW'])
    }
  })

  it('returns correct regardless of guess order', () => {
    const result = evaluateGuess(['ARROW', 'ALPHA', 'APPLE', 'ANGEL'], GROUPS)
    expect(result.kind).toBe('correct')
  })

  it('returns oneAway when 3 of 4 tiles share a group', () => {
    // 3 A-words + 1 B-word
    const result = evaluateGuess(['ALPHA', 'ANGEL', 'APPLE', 'BANANA'], GROUPS)
    expect(result.kind).toBe('oneAway')
  })

  it('returns wrong when at most 2 tiles share any one group', () => {
    // 2 A-words + 2 B-words (max overlap 2)
    const result = evaluateGuess(['ALPHA', 'ANGEL', 'BANANA', 'BIRCH'], GROUPS)
    expect(result.kind).toBe('wrong')
  })

  it('returns wrong for a fully-mixed guess (one from each group)', () => {
    const result = evaluateGuess(['ALPHA', 'BANANA', 'CASTLE', 'DAGGER'], GROUPS)
    expect(result.kind).toBe('wrong')
  })

  it('returns wrong when the guess has fewer than 4 tiles', () => {
    // Should never happen in practice (the BoardScreen guards submit
    // on selection size), but the function shouldn't false-positive
    // a "correct" if it does — short input means no group can have
    // 4 overlap.
    const result = evaluateGuess(['ALPHA', 'ANGEL', 'APPLE'], GROUPS)
    expect(result.kind).toBe('wrong')
  })

  it('returned members is a copy, not a reference to the group', () => {
    // Defensive — callers shouldn't be able to mutate the
    // canonical board by writing to the result.
    const result = evaluateGuess(['ALPHA', 'ANGEL', 'APPLE', 'ARROW'], GROUPS)
    if (result.kind === 'correct') {
      result.members.push('NEW')
      expect(GROUPS[0].members).toEqual(['ALPHA', 'ANGEL', 'APPLE', 'ARROW'])
    }
  })
})

describe('sameTileSet', () => {
  it('returns true for the same tiles in the same order', () => {
    expect(sameTileSet(['A', 'B', 'C', 'D'], ['A', 'B', 'C', 'D'])).toBe(true)
  })

  it('returns true for the same tiles in different order', () => {
    expect(sameTileSet(['A', 'B', 'C', 'D'], ['D', 'C', 'B', 'A'])).toBe(true)
  })

  it('returns false when any tile differs', () => {
    expect(sameTileSet(['A', 'B', 'C', 'D'], ['A', 'B', 'C', 'E'])).toBe(false)
  })

  it('returns false for different-length lists', () => {
    expect(sameTileSet(['A', 'B', 'C'], ['A', 'B', 'C', 'D'])).toBe(false)
  })
})
