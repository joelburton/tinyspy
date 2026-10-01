// cs-unmet

import { describe, expect, it } from 'vitest'
import { computeBubblePosition } from './bubblePosition'

/** A carrier `width` × 20 at (`left`, `top`). */
function carrier(left: number, top: number, width = 40) {
  return { left, top, bottom: top + 20, width, height: 20 }
}

const BUBBLE = { width: 100, height: 24 }

describe('computeBubblePosition', () => {
  it('centers the bubble above the carrier', () => {
    expect(computeBubblePosition(carrier(200, 300), BUBBLE, 1000)).toEqual({ x: 170, y: 268 })
  })

  it('flips below when there is no room on top', () => {
    expect(computeBubblePosition(carrier(200, 10), BUBBLE, 1000)?.y).toBe(38)
  })

  it('keeps the bubble inside the left edge', () => {
    expect(computeBubblePosition(carrier(0, 300), BUBBLE, 1000)?.x).toBe(4)
  })

  it('keeps the bubble inside the right edge', () => {
    expect(computeBubblePosition(carrier(980, 300), BUBBLE, 1000)?.x).toBe(896)
  })

  it('places nothing for a carrier that has left the page', () => {
    const gone = { left: 0, top: 0, bottom: 0, width: 0, height: 0 }
    expect(computeBubblePosition(gone, BUBBLE, 1000)).toBeNull()
  })
})
