// cs-unmet

import { describe, expect, it } from 'vitest'
import { makeNextRackOrder } from './rackOrder'

describe('makeNextRackOrder', () => {
  it('keeps the tiles that stayed in their order and puts the drawn ones on the right', () => {
    // Shown as slots 3 0 2 1 4; slots 0 and 2 were played and two were drawn.
    // The server's new rack is [old 1, old 3, old 4, drawn, drawn] = slots 0..4.
    expect(makeNextRackOrder([3, 0, 2, 1, 4], { removed: new Set([0, 2]), oldLen: 5 }, 5))
      .toEqual([1, 0, 2, 3, 4])
  })

  it('a bag that ran dry draws fewer', () => {
    expect(makeNextRackOrder([2, 1, 0], { removed: new Set([1]), oldLen: 3 }, 2))
      .toEqual([1, 0])
  })

  it('starts from slot order when no move of mine changed the rack', () => {
    expect(makeNextRackOrder([2, 0, 1], null, 3)).toEqual([0, 1, 2])
  })

  it('starts from slot order when the lengths do not add up', () => {
    expect(makeNextRackOrder([1, 0], { removed: new Set([0]), oldLen: 2 }, 4)).toEqual([0, 1, 2, 3])
  })
})
