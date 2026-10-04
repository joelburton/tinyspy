// cs-blessed-wordwheel

import { describe, expect, it } from 'vitest'
import { ZTest_tilesOf } from '@/shared/bee-games/beeGameData.fixture'
import { spentTileIds, trimClaims } from './spend'

/** A wheel with two Es: the center E (id '0'), then B, E, C in the ring
 *  (ids '1', '2', '3'). */
const TILES = ZTest_tilesOf('e', 'bec')
const TILES_BY_ID = new Map(TILES.map((t) => [t.id, t]))
const counts = (word: string) => {
  const m = new Map<string, number>()
  for (const ch of word) m.set(ch, (m.get(ch) ?? 0) + 1)
  return m
}
const spent = (word: string, claimedTileIds: string[] = []) =>
  [...spentTileIds(TILES, counts(word), claimedTileIds)].sort()

describe('spentTileIds', () => {
  it('spends the center first for a typed letter', () => {
    // Nothing was clicked, so nothing says WHICH E — and the center is the one
    // the mandatory use exists for.
    expect(spent('e')).toEqual(['0'])
    expect(spent('be')).toEqual(['0', '1'])
  })

  it('spends the tile that was actually clicked', () => {
    // The outer E is tile '2'. Clicking it must not mark the center.
    expect(spent('e', ['2'])).toEqual(['2'])
  })

  it("fills around a claim in the puzzle's order", () => {
    // Clicked the outer E, then typed a second one: the claim holds and the
    // center takes the overflow.
    expect(spent('ee', ['2'])).toEqual(['0', '2'])
  })

  it('ignores a claim the word no longer uses', () => {
    expect(spent('', ['2'])).toEqual([])
    expect(spent('b', ['2'])).toEqual(['1'])
  })

  it('spends one tile per occurrence, never more than the wheel has', () => {
    // Three Es on a two-E wheel: both tiles, and the third use marks nothing.
    expect(spent('eee')).toEqual(['0', '2'])
  })
})

describe('trimClaims', () => {
  it('drops the most recent claim a Backspace took off', () => {
    expect(trimClaims(['2', '0'], 'e', TILES_BY_ID)).toEqual(['2'])
  })

  it('forgets everything when the box is emptied', () => {
    expect(trimClaims(['2'], '', TILES_BY_ID)).toEqual([])
  })

  it('keeps a claim the word still has a letter for', () => {
    expect(trimClaims(['2'], 'bee', TILES_BY_ID)).toEqual(['2'])
  })
})
