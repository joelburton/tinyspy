// cs-unmet

import { useState } from 'react'
import { useBindAction, type Action } from '@/common/actions/useBindAction'
import { shuffle } from '@/common/utils/shuffle'
import { reconcileLocalOrder } from '../lib/localOrder'
import type { GTile } from '../types'

/**
 * The board's display order, and the Shuffle that changes it: the same loose
 * tiles in a fresh arrangement, purely visual and purely local — never a move,
 * never sent anywhere, and the picks survive it.
 *
 * Until the first shuffle the order is the board's own (the puzzle's `tiles`,
 * the same for every player). After it, this client's permutation, reconciled
 * with what is still on the grid: a matched category's tiles drop out and
 * every other tile stays where it was (`lib/localOrder.ts`). The order is
 * held as tile IDS, since a blob rebuilds every tile; the tiles handed back
 * are the live ones, in that order.
 *
 * Binds `act-shuffle`: hidden when the board cannot be shuffled (a past turn
 * open, or my play over — a finished board is a record of where the players
 * got to), so its key does not swallow a keystroke another action wanted. Not
 * gated on whose turn it is: rearranging your own view is not acting on the
 * board.
 */
export function useTileShuffle({
  tilesLeft,
  canShuffle,
}: {
  // The loose tiles, in the puzzle's order.
  tilesLeft: readonly GTile[]
  canShuffle: boolean
}): {
  tiles: GTile[]
  actShuffle: Action
} {
  // Null until the first shuffle: the board's own order.
  const [localOrderIds, setLocalOrderIds] = useState<string[] | null>(null)
  const leftIds = tilesLeft.map((t) => t.id)
  const displayedIds =
    localOrderIds
      ? reconcileLocalOrder(localOrderIds, leftIds)
      : leftIds

  const actShuffle = useBindAction('act-shuffle', {
    describe: () => {
      if (!canShuffle) return 'hidden'
      return displayedIds.length === 0 ? 'disabled' : 'active'
    },
    run: () => setLocalOrderIds(shuffle(displayedIds)),
  })

  // Every displayed id is one of the tiles left.
  const tileById = new Map(tilesLeft.map((t) => [t.id, t]))
  return { tiles: displayedIds.map((id) => tileById.get(id)!), actShuffle }
}
