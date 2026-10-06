// cs-unmet

import { useState } from 'react'
import { useBindAction, type Action } from '@/common/actions/useBindAction'
import { reconcileHandOrder, shuffleString } from '../lib/board'

/**
 * The order the hand's tiles are shown in, which is the player's own: Shuffle
 * reorders it, and nothing about it reaches the server. The hand itself is
 * derived from the tiles held and the board; the order is reconciled against
 * it each render (`reconcileHandOrder`), so a placement, a peel or a dump
 * never leaves it stale.
 *
 * Shuffle is live whenever there are tiles to rearrange, an inert board
 * included: reordering your own hand is not acting on the game.
 */
export function useHandOrder(derivedHand: string): {
  // The hand in its shuffled order.
  displayedHand: string
  actShuffle: Action
} {
  // Null until the first shuffle: the derived order is the shown order.
  const [handOrder, setHandOrder] = useState<string | null>(null)
  const displayedHand =
    handOrder === null
      ? derivedHand
      : reconcileHandOrder(handOrder, derivedHand)

  const actShuffle = useBindAction('act-shuffle', {
    describe: () => (displayedHand.length === 0 ? 'disabled' : 'active'),
    run: () => setHandOrder(shuffleString(displayedHand)),
  })

  return { displayedHand, actShuffle }
}
