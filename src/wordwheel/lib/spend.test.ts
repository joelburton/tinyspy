// cs-unmet

import { describe, expect, it } from 'vitest'
import { spentTiles, trimClaims, type Claim } from './spend'

/** A wheel with two Es: center E, then B, E, C in the ring. */
const TILES = ['E', 'B', 'E', 'C']
const counts = (word: string) => {
  const m = new Map<string, number>()
  for (const ch of word.toLowerCase()) m.set(ch, (m.get(ch) ?? 0) + 1)
  return m
}
const spent = (word: string, claims: Claim[] = []) => [...spentTiles(TILES, counts(word), claims)].sort()

describe('spentTiles', () => {
  it('spends the center first for a typed letter', () => {
    // Nothing was clicked, so nothing says WHICH E — and the center is the one
    // the mandatory use exists for.
    expect(spent('e')).toEqual([0])
    expect(spent('be')).toEqual([0, 1])
  })

  it('spends the tile that was actually clicked', () => {
    // The outer E is ordinal 1. Clicking it must not mark the center.
    expect(spent('e', [{ letter: 'E', ordinal: 1 }])).toEqual([2])
  })

  it('fills around a claim in render order', () => {
    // Clicked the outer E, then typed a second one: the claim holds and the
    // center takes the overflow.
    expect(spent('ee', [{ letter: 'E', ordinal: 1 }])).toEqual([0, 2])
  })

  it('ignores a claim the word no longer uses', () => {
    expect(spent('', [{ letter: 'E', ordinal: 1 }])).toEqual([])
    expect(spent('b', [{ letter: 'E', ordinal: 1 }])).toEqual([1])
  })

  it('spends one tile per occurrence, never more than the wheel has', () => {
    // Three Es on a two-E wheel: both tiles, and the third use marks nothing.
    expect(spent('eee')).toEqual([0, 2])
  })
})

describe('trimClaims', () => {
  it('drops the most recent claim a Backspace took off', () => {
    const claims: Claim[] = [
      { letter: 'E', ordinal: 1 },
      { letter: 'E', ordinal: 0 },
    ]
    expect(trimClaims(claims, 'e')).toEqual([{ letter: 'E', ordinal: 1 }])
  })

  it('forgets everything when the box is emptied', () => {
    expect(trimClaims([{ letter: 'E', ordinal: 1 }], '')).toEqual([])
  })

  it('keeps a claim the word still has a letter for', () => {
    const claims: Claim[] = [{ letter: 'E', ordinal: 1 }]
    expect(trimClaims(claims, 'bee')).toEqual(claims)
  })
})
