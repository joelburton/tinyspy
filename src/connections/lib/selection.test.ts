// cs-blessed-connections

import { describe, expect, it } from 'vitest'
import {
  applySelectionEvent,
  eventForClick,
  unionTiles,
  type SelectionMap,
} from './selection'

/**
 * Tests for the shared-selection rules — the coop click rule (doc.md → Coop)
 * and the reducer the Broadcast handler folds peer events through.
 *
 * Pure, so the rules are exercised outright, with no channel and no React.
 * Two properties are worth naming because neither is visible in a rendered
 * board: a no-op event returns the SAME map (which is what keeps an echo of
 * our own broadcast from re-rendering every peer), and the four-tile cap
 * counts the union across the table rather than any one player's picks.
 */

const ME = 'u-me'
const PEER = 'u-peer'

/** Shorthand for a map literal, since every case here starts from one. */
function held(...entries: [string, string[]][]): SelectionMap {
  return new Map(entries)
}

describe('applySelectionEvent — select', () => {
  it('adds a tile to the picker, in pick order', () => {
    const after = applySelectionEvent(held([ME, ['apple']]), {
      type: 'select',
      tile: 'brick',
      userId: ME,
    })
    expect(after.get(ME)).toEqual(['apple', 'brick'])
  })

  it('starts an entry for a player holding nothing yet', () => {
    const after = applySelectionEvent(held([ME, ['apple']]), {
      type: 'select',
      tile: 'brick',
      userId: PEER,
    })
    expect([...after]).toEqual([
      [ME, ['apple']],
      [PEER, ['brick']],
    ])
  })

  it('returns the same map when the picker already holds the tile', () => {
    // The echo case: our own broadcast comes back to us having already been
    // applied locally. Identity, not just equality — a new map would re-render
    // the board on every peer's every pick.
    const before = held([ME, ['apple']])
    expect(applySelectionEvent(before, { type: 'select', tile: 'apple', userId: ME })).toBe(
      before,
    )
  })
})

describe('applySelectionEvent — deselect', () => {
  it('takes the tile out of whoever holds it, not the sender', () => {
    // No user id on the event: the coop rule is that a tile anyone put up
    // comes out on a click, so the reducer searches for its holder.
    const after = applySelectionEvent(held([ME, ['apple']], [PEER, ['brick', 'cedar']]), {
      type: 'deselect',
      tile: 'brick',
    })
    expect(after.get(PEER)).toEqual(['cedar'])
    expect(after.get(ME)).toEqual(['apple'])
  })

  it('drops a player who is left holding nothing', () => {
    // Absent rather than present-and-empty — an empty list would draw that
    // player into `unionTiles`'s loop and into the board's per-player colors
    // for a player with no picks.
    const after = applySelectionEvent(held([ME, ['apple']], [PEER, ['brick']]), {
      type: 'deselect',
      tile: 'brick',
    })
    expect([...after.keys()]).toEqual([ME])
  })

  it('returns the same map when nobody holds the tile', () => {
    const before = held([ME, ['apple']])
    expect(applySelectionEvent(before, { type: 'deselect', tile: 'brick' })).toBe(before)
  })
})

describe('applySelectionEvent — clear', () => {
  it('empties every player, not just the sender', () => {
    const after = applySelectionEvent(held([ME, ['apple']], [PEER, ['brick']]), {
      type: 'clear',
    })
    expect(after.size).toBe(0)
  })

  it('returns the same map when there is nothing to clear', () => {
    const before = held()
    expect(applySelectionEvent(before, { type: 'clear' })).toBe(before)
  })
})

describe('eventForClick', () => {
  it('picks an unheld tile up as mine', () => {
    expect(eventForClick(held(), 'apple', ME)).toEqual({
      type: 'select',
      tile: 'apple',
      userId: ME,
    })
  })

  it('puts a tile a PEER is holding back down', () => {
    // The rule that makes the board shared: I can undo a teammate's pick, and
    // the event says nothing about who is clicking.
    expect(eventForClick(held([PEER, ['apple']]), 'apple', ME)).toEqual({
      type: 'deselect',
      tile: 'apple',
    })
  })

  it('refuses a fifth tile — the cap is the union across the table', () => {
    // Four already up, none of them mine. A per-player cap would let this
    // through and build a five-tile guess.
    const full = held([PEER, ['apple', 'brick', 'cedar', 'dune']])
    expect(eventForClick(full, 'eagle', ME)).toBeNull()
  })

  it('still lets the fourth tile through', () => {
    const three = held([ME, ['apple']], [PEER, ['brick', 'cedar']])
    expect(eventForClick(three, 'dune', ME)).toEqual({
      type: 'select',
      tile: 'dune',
      userId: ME,
    })
  })

  it('lets a tile out of a full guess, so a pick can be swapped', () => {
    // The board is never stuck: with four up, the only click that does
    // anything is one that takes a tile back off.
    const full = held([ME, ['apple', 'brick', 'cedar', 'dune']])
    expect(eventForClick(full, 'dune', ME)).toEqual({ type: 'deselect', tile: 'dune' })
  })
})

describe('unionTiles', () => {
  it('flattens every player’s picks in pick order', () => {
    expect(unionTiles(held([ME, ['apple', 'brick']], [PEER, ['cedar']]))).toEqual([
      'apple',
      'brick',
      'cedar',
    ])
  })

  it('is empty for an untouched board', () => {
    expect(unionTiles(held())).toEqual([])
  })
})
