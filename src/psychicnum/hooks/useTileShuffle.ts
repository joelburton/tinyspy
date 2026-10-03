// cs-unmet

import { useCallback, useMemo, useState } from 'react'
import { useBindAction, type Action } from '@/common/actions/useBindAction'
import { shuffle } from '@/common/utils/shuffle'
import type { GTile } from '../types'

/**
 * The board's display order, and the Shuffle that changes it: the same tiles
 * in a fresh arrangement, purely visual and purely local — never a move, never
 * sent anywhere.
 *
 * Binds `act-shuffle`, live in every state (an ended game included), so its
 * key works whatever the board is doing.
 *
 * The order is held as tile IDS, derived from a counter the Shuffle bumps and
 * keyed on the ids as a STRING rather than the array: `useGame` hands fresh
 * tiles on every reload, and keying on them would reshuffle the board on every
 * guess. The tiles handed back are the live ones, looked up in that order.
 */
export function useTileShuffle(tiles: readonly GTile[]): {
  tiles: GTile[]
  actShuffle: Action
} {
  const [shuffleSeed, setShuffleSeed] = useState(0)
  // '\n' never appears inside a dictionary word.
  const idsKey = tiles.map((t) => t.id).join('\n')

  const orderedIds = useMemo(() => {
    if (idsKey === '') return []
    void shuffleSeed
    return shuffle(idsKey.split('\n'))
  }, [idsKey, shuffleSeed])

  const reshuffle = useCallback(() => setShuffleSeed((s) => s + 1), [])
  const actShuffle = useBindAction('act-shuffle', {
    describe: () => 'active',
    run: reshuffle,
  })

  // Every ordered id is one of the tiles the order was taken from.
  const tileById = new Map(tiles.map((t) => [t.id, t]))
  return { tiles: orderedIds.map((id) => tileById.get(id)!), actShuffle }
}
