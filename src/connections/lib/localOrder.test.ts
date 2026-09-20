// cs-blessed-connections

import { describe, expect, it } from 'vitest'
import { reconcileLocalOrder } from './localOrder'

/**
 * Tests for the local-order reconciler — pure and deterministic, so its three
 * scenarios are exercised outright:
 *
 *   - tile removed upstream → drop it, keep others' positions
 *   - tile added upstream (defensive, connections doesn't do this) →
 *     append at the end
 *   - upstream identical to local → no-op
 */

describe('reconcileLocalOrder', () => {
  it('drops tiles that disappeared from remaining', () => {
    // Local order has A B C D; a category matched and tiles A, C
    // are gone upstream. The result preserves B and D in their
    // local positions (B before D, as they were).
    const local = ['A', 'B', 'C', 'D']
    const remaining = ['B', 'D']
    expect(reconcileLocalOrder(local, remaining)).toEqual(['B', 'D'])
  })

  it('preserves the local order for surviving tiles', () => {
    // The classic connections case: 12 remaining tiles, player has
    // shuffled them, then a category matches. We assert that the
    // 8 surviving tiles stay in the player's chosen order, even
    // though `remaining` would have a different (upstream) order.
    const local = ['D', 'C', 'B', 'A', 'H', 'G', 'F', 'E', 'L', 'K', 'J', 'I']
    const remaining = ['A', 'B', 'C', 'D', 'I', 'J', 'K', 'L']  // E, F, G, H matched
    expect(reconcileLocalOrder(local, remaining)).toEqual([
      'D', 'C', 'B', 'A', 'L', 'K', 'J', 'I',
    ])
  })

  it('is a no-op when local matches remaining', () => {
    const local = ['A', 'B', 'C', 'D']
    expect(reconcileLocalOrder(local, ['A', 'B', 'C', 'D'])).toEqual([
      'A', 'B', 'C', 'D',
    ])
  })

  it('appends tiles present in remaining but not local (defensive)', () => {
    // connections never adds tiles mid-game, but the helper handles
    // the case so the contract is "no tile ever gets dropped."
    const local = ['A', 'B']
    const remaining = ['A', 'B', 'C']
    expect(reconcileLocalOrder(local, remaining)).toEqual(['A', 'B', 'C'])
  })

  it('handles a fully-replaced set (drop everything, take everything new)', () => {
    const local = ['A', 'B']
    const remaining = ['X', 'Y']
    expect(reconcileLocalOrder(local, remaining)).toEqual(['X', 'Y'])
  })
})
