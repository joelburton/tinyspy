import { describe, expect, it } from 'vitest'
import { reconcileLocalOrder, shuffleTiles } from './localOrder'

/**
 * Tests for the per-player local-shuffle helpers. `shuffleTiles`
 * is non-deterministic by design (calls `Math.random`); we test
 * its invariants (same length, same element set, returns a copy)
 * rather than a specific output. `reconcileLocalOrder` is pure
 * and deterministic — we exercise its three scenarios:
 *
 *   - tile removed upstream → drop it, keep others' positions
 *   - tile added upstream (defensive, connections doesn't do this) →
 *     append at the end
 *   - upstream identical to local → no-op
 */

describe('shuffleTiles', () => {
  it('returns a new array (does not mutate the input)', () => {
    const input = ['A', 'B', 'C', 'D']
    const out = shuffleTiles(input)
    expect(out).not.toBe(input)
    // Input untouched.
    expect(input).toEqual(['A', 'B', 'C', 'D'])
  })

  it('preserves length and element set', () => {
    const input = ['ALPHA', 'BANANA', 'CASTLE', 'DAGGER']
    const out = shuffleTiles(input)
    expect(out).toHaveLength(input.length)
    expect([...out].sort()).toEqual([...input].sort())
  })

  it('returns an empty array for an empty input', () => {
    expect(shuffleTiles([])).toEqual([])
  })
})

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
