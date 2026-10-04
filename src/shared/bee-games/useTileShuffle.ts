// cs-unmet

import { useMemo, useState } from 'react'
import { useBindAction, type Action } from '@/common/actions/useBindAction'
import { shuffle } from '@/common/utils/shuffle'
import type { BeeTile } from './beeGameData'

/**
 * The board's display order, and the Shuffle that changes it: the center where
 * it always is, the outer tiles in a fresh arrangement around it, purely visual
 * and purely local — never a move, never sent anywhere. A fresh scan of the
 * same letters is how a word that was hiding gets found, so the Shuffle is
 * live in every state, a finished board included.
 *
 * Binds `act-shuffle`, so the floating button, the menu row and ⌥Z are one
 * action.
 *
 * The order is held as tile IDS, derived from a counter the Shuffle bumps and
 * keyed on the ids as a STRING rather than the array: a reload hands the page
 * fresh tiles, and keying on them would reshuffle the board on every submit.
 * The tiles handed back are the live ones, looked up in that order.
 */
export function useTileShuffle(tiles: readonly BeeTile[]): {
  // The tiles in display order, the center first.
  tiles: BeeTile[]
  actShuffle: Action
} {
  const [shuffleSeed, setShuffleSeed] = useState(0)
  // ' ' never appears in a tile id (the place as text).
  const outerIdsKey = tiles.filter((t) => !t.center).map((t) => t.id).join(' ')
  const outerIds = useMemo(() => {
    void shuffleSeed
    return shuffle(outerIdsKey.split(' '))
  }, [outerIdsKey, shuffleSeed])
  const actShuffle = useBindAction('act-shuffle', {
    describe: () => 'active',
    run: () => setShuffleSeed((s) => s + 1),
  })
  // Every ordered id is one of the tiles the order was taken from, and the
  // center is one of the tiles.
  const tileById = new Map(tiles.map((t) => [t.id, t]))
  const center = tiles.find((t) => t.center)!
  return { tiles: [center, ...outerIds.map((id) => tileById.get(id)!)], actShuffle }
}
