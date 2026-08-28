// cs-unmet

import { describe, expect, it } from 'vitest'
import {
  bunchSizeError,
  DEFAULT_BANANAGRAMS_SETUP,
  BANANAGRAMS_BUNCH_MAX,
  type BananagramsSetup,
} from './setup'

/**
 * `bunchSizeError` is the gate the SetupGameModal runs (via the manifest's
 * `validate`) to disable Start until the chosen bunch can deal everyone a
 * starter hand. It mirrors `bananagrams.create_game`'s server-side checks.
 *
 * Every message it gives is about `bunch_size` — that is the number you change
 * to fix any of them, even the one whose arithmetic involves `hand_size` and
 * the headcount — so the key is asserted with the words each time.
 */
const onBunch = (pattern: RegExp) => ({ bunch_size: expect.stringMatching(pattern) })
const base = (over: Partial<BananagramsSetup> = {}): BananagramsSetup => ({
  ...DEFAULT_BANANAGRAMS_SETUP,
  ...over,
})

describe('bunchSizeError', () => {
  it('passes when the bunch holds at least one hand per player', () => {
    // 4 players × 21 = 84 ≤ 144.
    expect(bunchSizeError(base({ hand_size: 21, bunch_size: 144 }), 4)).toEqual({})
    // Exact fit is allowed (a speed round with no bunch left).
    expect(bunchSizeError(base({ hand_size: 21, bunch_size: 42 }), 2)).toEqual({})
  })

  it('rejects a bunch too small to deal every hand', () => {
    // 2 players × 21 = 42 needed, bunch holds 40. It names the needed total
    // plus the players × hand math, so the arithmetic is checkable on screen.
    const err = bunchSizeError(base({ hand_size: 21, bunch_size: 40 }), 2)
    expect(err).toEqual(onBunch(/needs 42 \(2 × 21\)/))
  })

  it('shows the single-player math', () => {
    expect(bunchSizeError(base({ hand_size: 21, bunch_size: 10 }), 1)).toEqual(
      onBunch(/needs 21 \(1 × 21\)/),
    )
  })

  it(`rejects a bunch larger than ${BANANAGRAMS_BUNCH_MAX}`, () => {
    expect(bunchSizeError(base({ bunch_size: 145 }), 2)).toEqual(onBunch(/at most 144/))
  })

  it('rejects a non-integer or sub-1 bunch (e.g. a cleared input → NaN)', () => {
    for (const bunch_size of [Number.NaN, 0, 12.5]) {
      expect(bunchSizeError(base({ bunch_size }), 2)).toEqual(onBunch(/whole number/))
    }
  })

  it('treats the deal-size check before the headcount is known gracefully', () => {
    // playerCount 0 (no one picked yet) needs 0 tiles — never the blocker;
    // the dialog's own min-players gate handles an empty picker.
    expect(bunchSizeError(base({ bunch_size: 144 }), 0)).toEqual({})
  })
})
