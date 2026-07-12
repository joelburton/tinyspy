import { describe, expect, it } from 'vitest'
import { wordFitsWheel } from './tiles'

/** A wheel with a doubled 'e' tile (centre + an outer e) and single tiles for
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

describe('wordFitsWheel', () => {
  it('accepts a word within the wheel tiles', () => {
    expect(wordFitsWheel('bead', counts)).toBe(true)
  })

  it('accepts using a doubled letter up to its tile count', () => {
    // two e's, and the wheel has two e-tiles → fits.
    expect(wordFitsWheel('bee', counts)).toBe(true)
  })

  it('rejects an off-wheel letter (zero tiles)', () => {
    expect(wordFitsWheel('zzzz', counts)).toBe(false)
    expect(wordFitsWheel('bez', counts)).toBe(false)
  })

  it('rejects over-using a letter past its tile count', () => {
    // three e's, but only two e-tiles.
    expect(wordFitsWheel('eee', counts)).toBe(false)
    // 'bead' fits, but a second 'd' would over-use the single d-tile.
    expect(wordFitsWheel('dead', counts)).toBe(false)
  })

  it('is case-insensitive', () => {
    expect(wordFitsWheel('BEAD', counts)).toBe(true)
    expect(wordFitsWheel('BEZ', counts)).toBe(false)
  })

  it('treats the empty word as fitting (vacuously)', () => {
    expect(wordFitsWheel('', counts)).toBe(true)
  })
})
