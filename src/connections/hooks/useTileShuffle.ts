// cs-unmet

import { useState } from 'react'
import { useBindAction, type Action } from '@/common/actions/useBindAction'
import { shuffle } from '@/common/utils/shuffle'
import { reconcileLocalOrder } from '../lib/localOrder'

/**
 * The board's display order, and the Shuffle that changes it: the same loose
 * tiles in a fresh arrangement, purely visual and purely local — never a move,
 * never sent anywhere, and the picks survive it.
 *
 * Until the first shuffle the order is the board's own (`tileOrder`, the same
 * for every player). After it, this client's permutation, reconciled with what
 * is still on the grid: a matched category's tiles drop out and every other
 * tile stays where it was (`lib/localOrder.ts`).
 *
 * Binds `act-shuffle`: hidden when the board cannot be shuffled (a past turn
 * open, or my play over — a finished board is a record of where the players
 * got to), so its key does not swallow a keystroke another action wanted. Not
 * gated on whose turn it is: rearranging your own view is not acting on the
 * board.
 */
export function useTileShuffle({
  remainingTiles,
  canShuffle,
}: {
  // The loose tiles, in the board's order.
  remainingTiles: readonly string[]
  canShuffle: boolean
}): {
  tiles: string[]
  actShuffle: Action
} {
  // Null until the first shuffle: the board's own order.
  const [localOrder, setLocalOrder] = useState<string[] | null>(null)
  const displayedTiles = localOrder
    ? reconcileLocalOrder(localOrder, [...remainingTiles])
    : [...remainingTiles]

  const actShuffle = useBindAction('act-shuffle', {
    describe: () => {
      if (!canShuffle) return 'hidden'
      return displayedTiles.length === 0 ? 'disabled' : 'active'
    },
    run: () => setLocalOrder(shuffle(displayedTiles)),
  })

  return { tiles: displayedTiles, actShuffle }
}
