import { describe, expect, it } from 'vitest'
import { liveSelection, toggleCard } from './selection'
import { paletteOf } from './setup'

describe('toggleCard', () => {
  it('adds a card that is not selected', () => {
    expect(toggleCard([], 5)).toEqual([5])
    expect(toggleCard([5], 9)).toEqual([5, 9])
  })

  it('removes a card that is already selected', () => {
    expect(toggleCard([5, 9], 5)).toEqual([9])
    expect(toggleCard([5], 5)).toEqual([])
  })

  it('refuses a fourth card', () => {
    expect(toggleCard([1, 2, 3], 4)).toEqual([1, 2, 3])
  })

  it('still deselects when three are held', () => {
    // Otherwise a mis-click on the third card would be unrecoverable except by
    // clearing the whole selection.
    expect(toggleCard([1, 2, 3], 2)).toEqual([1, 3])
  })
})

describe('liveSelection', () => {
  it('keeps cards that are still on the board', () => {
    expect(liveSelection([1, 2], [0, 1, 2, 3])).toEqual([1, 2])
  })

  it('drops a card a rival claimed out from under the selection', () => {
    // The contention case. The card is gone from the board, so it is gone from
    // the selection — no stale highlight, and no claim fired at a card that
    // isn't there.
    expect(liveSelection([1, 2], [0, 2, 3])).toEqual([2])
  })

  it('empties when the whole selection is taken', () => {
    expect(liveSelection([1, 2], [7, 8, 9])).toEqual([])
  })

  it('leaves an empty selection alone', () => {
    expect(liveSelection([], [1, 2, 3])).toEqual([])
  })
})

describe('paletteOf', () => {
  it('defaults a game with no palette to traditional', () => {
    // `setup` is frozen at create time, so every game started before the knob
    // existed has no key — and indexing a lookup table by `undefined` is what
    // crashed the printer the first time it drew a card.
    expect(paletteOf(undefined)).toBe('traditional')
    expect(paletteOf({})).toBe('traditional')
    expect(paletteOf({ palette: 'traditional' })).toBe('traditional')
    expect(paletteOf({ palette: 'colorblind' })).toBe('colorblind')
  })
})
