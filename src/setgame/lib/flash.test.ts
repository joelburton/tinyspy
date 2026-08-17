import { describe, expect, it } from 'vitest'
import { claimTransition } from './flash'

describe('claimTransition', () => {
  it('pairs what left each slot with what took its place', () => {
    // The ordinary claim: three cards replaced where they sat.
    expect(claimTransition([10, 11, 12, 13, 14, 15], [10, 99, 12, 98, 14, 97])).toEqual({
      leaving: [11, 13, 15],
      arriving: [99, 98, 97],
    })
  })

  it('says nothing changed when nothing changed', () => {
    // Realtime refetches deliver the same board constantly; none may light it up.
    const board = [1, 2, 3, 4]
    expect(claimTransition(board, board)).toEqual({ leaving: [], arriving: [] })
  })

  it('marks a card that MOVED, not just one drawn from the deck', () => {
    // Claiming from a fifteen-card table compacts back to twelve: the cards at
    // the end move into the holes. They were already on the board, so a
    // set-difference finds nothing new and they land silently — the case where
    // you most need to be told where things went. Slot-by-slot catches it.
    expect(claimTransition([10, 11, 12, 99], [99, 11, 12])).toEqual({
      leaving: [10, 99],
      arriving: [99],
    })
  })

  it('marks an appended column as arriving', () => {
    // A claim on a set-free table replaces three AND deals three more. The new
    // column is the part most worth watching arrive.
    expect(claimTransition([1, 2, 3], [1, 2, 3, 7, 8, 9])).toEqual({
      leaving: [],
      arriving: [7, 8, 9],
    })
  })

  it('marks the tail as leaving when the board shrinks', () => {
    // The deck is spent, so three slots go away entirely: their cards are
    // leaving and nothing arrives in their place.
    expect(claimTransition([1, 2, 3, 4, 5, 6], [1, 2, 3])).toEqual({
      leaving: [4, 5, 6],
      arriving: [],
    })
  })
})
