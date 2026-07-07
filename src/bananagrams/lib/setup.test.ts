import { describe, expect, it } from 'vitest'
import {
  bunchSizeError,
  DEFAULT_BANANAGRAMS_SETUP,
  BANANAGRAMS_BUNCH_MAX,
  type BananagramsSetup,
} from './setup'

/**
 * `bunchSizeError` is the gate the SetupGameDialog runs (via the manifest's
 * `validate`) to disable Start until the chosen bunch can deal everyone a
 * starter hand. It mirrors `bananagrams.create_game`'s server-side checks.
 */
const base = (over: Partial<BananagramsSetup> = {}): BananagramsSetup => ({
  ...DEFAULT_BANANAGRAMS_SETUP,
  ...over,
})

describe('bunchSizeError', () => {
  it('passes when the bunch holds at least one hand per player', () => {
    // 4 players × 21 = 84 ≤ 144.
    expect(bunchSizeError(base({ hand_size: 21, bunch_size: 144 }), 4)).toBeNull()
    // Exact fit is allowed (a speed round with no bunch left).
    expect(bunchSizeError(base({ hand_size: 21, bunch_size: 42 }), 2)).toBeNull()
  })

  it('rejects a bunch too small to deal every hand', () => {
    // 2 players × 21 = 42 needed, bunch holds 40. The message is deliberately
    // one line (the dialog's validation slot is single-line): the needed total
    // plus the players × hand math, compactly.
    const err = bunchSizeError(base({ hand_size: 21, bunch_size: 40 }), 2)
    expect(err).toMatch(/needs 42 \(2 × 21\)/)
  })

  it('shows the single-player math', () => {
    expect(bunchSizeError(base({ hand_size: 21, bunch_size: 10 }), 1)).toMatch(
      /needs 21 \(1 × 21\)/,
    )
  })

  it(`rejects a bunch larger than ${BANANAGRAMS_BUNCH_MAX}`, () => {
    expect(bunchSizeError(base({ bunch_size: 145 }), 2)).toMatch(/at most 144/)
  })

  it('rejects a non-integer or sub-1 bunch (e.g. a cleared input → NaN)', () => {
    expect(bunchSizeError(base({ bunch_size: Number.NaN }), 2)).toMatch(/whole number/)
    expect(bunchSizeError(base({ bunch_size: 0 }), 2)).toMatch(/whole number/)
    expect(bunchSizeError(base({ bunch_size: 12.5 }), 2)).toMatch(/whole number/)
  })

  it('treats the deal-size check before the headcount is known gracefully', () => {
    // playerCount 0 (no one picked yet) needs 0 tiles — never the blocker;
    // the dialog's own min-players gate handles an empty picker.
    expect(bunchSizeError(base({ bunch_size: 144 }), 0)).toBeNull()
  })
})
