import { describe, expect, it } from 'vitest'
import {
  bagSizeError,
  DEFAULT_BANANAGRAMS_SETUP,
  BANANAGRAMS_BAG_MAX,
  type BananagramsSetup,
} from './setup'

/**
 * `bagSizeError` is the gate the SetupGameDialog runs (via the manifest's
 * `validate`) to disable Start until the chosen bag can deal everyone a
 * starter hand. It mirrors `bananagrams.create_game`'s server-side checks.
 */
const base = (over: Partial<BananagramsSetup> = {}): BananagramsSetup => ({
  ...DEFAULT_BANANAGRAMS_SETUP,
  ...over,
})

describe('bagSizeError', () => {
  it('passes when the bag holds at least one hand per player', () => {
    // 4 players × 21 = 84 ≤ 144.
    expect(bagSizeError(base({ hand_size: 21, bag_size: 144 }), 4)).toBeNull()
    // Exact fit is allowed (a speed round with no bunch left).
    expect(bagSizeError(base({ hand_size: 21, bag_size: 42 }), 2)).toBeNull()
  })

  it('rejects a bag too small to deal every hand', () => {
    // 2 players × 21 = 42 needed, bag holds 40.
    const err = bagSizeError(base({ hand_size: 21, bag_size: 40 }), 2)
    expect(err).toMatch(/2 players × 21 tiles = 42/)
  })

  it('singularizes the player count', () => {
    expect(bagSizeError(base({ hand_size: 21, bag_size: 10 }), 1)).toMatch(
      /1 player ×/,
    )
  })

  it(`rejects a bag larger than ${BANANAGRAMS_BAG_MAX}`, () => {
    expect(bagSizeError(base({ bag_size: 145 }), 2)).toMatch(/at most 144/)
  })

  it('rejects a non-integer or sub-1 bag (e.g. a cleared input → NaN)', () => {
    expect(bagSizeError(base({ bag_size: Number.NaN }), 2)).toMatch(/whole number/)
    expect(bagSizeError(base({ bag_size: 0 }), 2)).toMatch(/whole number/)
    expect(bagSizeError(base({ bag_size: 12.5 }), 2)).toMatch(/whole number/)
  })

  it('treats the deal-size check before the headcount is known gracefully', () => {
    // playerCount 0 (no one picked yet) needs 0 tiles — never the blocker;
    // the dialog's own min-players gate handles an empty picker.
    expect(bagSizeError(base({ bag_size: 144 }), 0)).toBeNull()
  })
})
