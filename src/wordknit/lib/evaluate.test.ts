import { describe, expect, it } from 'vitest'
import { evaluateGuess, sameTileSet } from './evaluate'
import type { Category } from './board'

const CATEGORIES: Category[] = [
  { rank: 0, name: 'A-words', tiles: ['ALPHA', 'ANGEL', 'APPLE', 'ARROW'] },
  { rank: 1, name: 'B-words', tiles: ['BANANA', 'BIRCH', 'BREAD', 'BRICK'] },
  { rank: 2, name: 'C-words', tiles: ['CASTLE', 'CIRCLE', 'CLOUD', 'CROWN'] },
  { rank: 3, name: 'D-words', tiles: ['DAGGER', 'DELTA', 'DIAMOND', 'DRAGON'] },
]

describe('evaluateGuess', () => {
  it('returns correct with rank + name + tiles for a 4-of-4 match', () => {
    const result = evaluateGuess(
      ['ALPHA', 'ANGEL', 'APPLE', 'ARROW'],
      CATEGORIES,
    )
    expect(result.kind).toBe('correct')
    if (result.kind === 'correct') {
      expect(result.rank).toBe(0)
      expect(result.name).toBe('A-words')
      expect(result.tiles).toEqual(['ALPHA', 'ANGEL', 'APPLE', 'ARROW'])
    }
  })

  it('returns correct regardless of guess order', () => {
    const result = evaluateGuess(
      ['ARROW', 'ALPHA', 'APPLE', 'ANGEL'],
      CATEGORIES,
    )
    expect(result.kind).toBe('correct')
  })

  it('returns oneAway when 3 of 4 tiles share a category', () => {
    // 3 A-words + 1 B-word
    const result = evaluateGuess(
      ['ALPHA', 'ANGEL', 'APPLE', 'BANANA'],
      CATEGORIES,
    )
    expect(result.kind).toBe('oneAway')
  })

  it('returns wrong when at most 2 tiles share any one category', () => {
    // 2 A-words + 2 B-words (max overlap 2)
    const result = evaluateGuess(
      ['ALPHA', 'ANGEL', 'BANANA', 'BIRCH'],
      CATEGORIES,
    )
    expect(result.kind).toBe('wrong')
  })

  it('returns wrong for a fully-mixed guess (one from each category)', () => {
    const result = evaluateGuess(
      ['ALPHA', 'BANANA', 'CASTLE', 'DAGGER'],
      CATEGORIES,
    )
    expect(result.kind).toBe('wrong')
  })

  it('returns wrong when the guess has fewer than 4 tiles', () => {
    // Should never happen in practice (the BoardScreen guards submit
    // on selection size), but the function shouldn't false-positive
    // a "correct" if it does — short input means no category can have
    // 4 overlap.
    const result = evaluateGuess(['ALPHA', 'ANGEL', 'APPLE'], CATEGORIES)
    expect(result.kind).toBe('wrong')
  })

  it('returned tiles is a copy, not a reference to the category', () => {
    // Defensive — callers shouldn't be able to mutate the
    // canonical board by writing to the result.
    const result = evaluateGuess(
      ['ALPHA', 'ANGEL', 'APPLE', 'ARROW'],
      CATEGORIES,
    )
    if (result.kind === 'correct') {
      result.tiles.push('NEW')
      expect(CATEGORIES[0].tiles).toEqual(['ALPHA', 'ANGEL', 'APPLE', 'ARROW'])
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
