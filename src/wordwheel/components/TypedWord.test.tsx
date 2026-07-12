// @vitest-environment jsdom
import { describe, expect, it } from 'vitest'
import { render } from '@testing-library/react'
import { TypedWord } from './TypedWord'

/** Tile counts for an all-distinct 9-tile wheel (center 'e' + 8 outer). */
const singleTiles = new Map(
  ['e', 'a', 'b', 'c', 'd', 'f', 'g', 'h', 'i'].map((l) => [l, 1]),
)

/** Tile counts for a DUPLICATE-letter wheel: {a,b,c,d,e,e,f,g,g} — two
 *  e-tiles (one the center) and two g-tiles. */
const dupTiles = new Map([
  ['a', 1], ['b', 1], ['c', 1], ['d', 1], ['e', 2], ['f', 1], ['g', 2],
])

/** A span is "dimmed" (illegal) iff it carries a (hashed) CSS-module class; a
 *  legal character renders with an empty className. */
function dimFlags(word: string, letterCounts: Map<string, number>): boolean[] {
  const { container } = render(<TypedWord word={word} letterCounts={letterCounts} />)
  return Array.from(container.querySelectorAll('span')).map((s) => s.className !== '')
}

describe('TypedWord dimming', () => {
  it('dims a letter that is not on the wheel', () => {
    // 't' is off the wheel → dimmed; the rest are legal.
    expect(dimFlags('BEAT', singleTiles)).toEqual([false, false, false, true])
  })

  it('dims a letter past its tile count (single-tile wheel: from the 2nd use)', () => {
    // 'BEE': first E legal, second E dimmed (one e-tile).
    expect(dimFlags('BEE', singleTiles)).toEqual([false, false, true])
    // 'ABIDE' — all distinct, all on the wheel → none dimmed.
    expect(dimFlags('ABIDE', singleTiles)).toEqual([false, false, false, false, false])
  })

  it('dims the third occurrence too, and treats off-wheel + over-count the same', () => {
    // 'BEEF': B ok, E ok, E over-count (dim), F ok.
    expect(dimFlags('BEEF', singleTiles)).toEqual([false, false, true, false])
    // 'EEE': first ok, next two exceed the single e-tile.
    expect(dimFlags('EEE', singleTiles)).toEqual([false, true, true])
  })

  it('allows a repeat UP TO the tile count on a duplicate-letter wheel', () => {
    // Two e-tiles: 'BEE' is fully legal; a THIRD e would dim.
    expect(dimFlags('BEE', dupTiles)).toEqual([false, false, false])
    expect(dimFlags('BEEE', dupTiles)).toEqual([false, false, false, true])
    // 'EGGED' spends both e-tiles and both g-tiles — fully legal.
    expect(dimFlags('EGGED', dupTiles)).toEqual([false, false, false, false, false])
  })
})
