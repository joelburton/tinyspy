// cs-blessed-wordwheel

import { describe, expect, it } from 'vitest'
import { canSpellFromTiles } from './tiles'

/** A wheel with a doubled 'e' tile (center + an outer e) and single tiles for
 *  b, a, d, c, f, g, h — the shape the PlayArea tests use. */
const counts = new Map<string, number>([
  ['e', 2],
  ['b', 1],
  ['a', 1],
  ['d', 1],
  ['c', 1],
  ['f', 1],
  ['g', 1],
  ['h', 1],
])

describe('canSpellFromTiles', () => {
  it('accepts a word within the wheel tiles', () => {
    expect(canSpellFromTiles('bead', counts)).toBe(true)
  })

  it('accepts using a doubled letter up to its tile count', () => {
    // two e's, and the wheel has two e-tiles → fits.
    expect(canSpellFromTiles('bee', counts)).toBe(true)
  })

  it('rejects an off-wheel letter (zero tiles)', () => {
    expect(canSpellFromTiles('zzzz', counts)).toBe(false)
    expect(canSpellFromTiles('bez', counts)).toBe(false)
  })

  it('rejects over-using a letter past its tile count', () => {
    // three e's, but only two e-tiles.
    expect(canSpellFromTiles('eee', counts)).toBe(false)
    // 'bead' fits, but a second 'd' would over-use the single d-tile.
    expect(canSpellFromTiles('dead', counts)).toBe(false)
  })

  it('treats the empty word as fitting (vacuously)', () => {
    expect(canSpellFromTiles('', counts)).toBe(true)
  })
})
