// cs-unmet

import { useCallback, useState } from 'react'
import { useMark } from '@/common/board-marks/useMark'
import { ATTENTION_FLASH_MS } from '@/common/board-marks/feedbackTiming'
import { makeNextRackOrder } from '../lib/rackOrder'
import type { GMoveSlots } from '../types'

/** No rack slots — the drawn-tiles mark between flashes. */
const NO_SLOTS: ReadonlySet<number> = new Set()

/**
 * The order the rack's tiles are shown in, which is the player's own: Shuffle
 * reorders it, a tile dragged along the rack moves in it, and nothing about it
 * reaches the server. The rack itself (`rack`, by slot) is the server's.
 *
 * After a move of mine draws tiles, `rebuild` keeps the tiles that stayed where
 * they were and adds the drawn ones on the right (`makeNextRackOrder`), and
 * flashes them — news arriving in place that the player did not choose, so it
 * takes the attention beat.
 */
export function useRackOrder(rack: readonly string[]): {
  // The rack in display order, each tile with its slot.
  tiles: { glyph: string; rackIdx: number }[]
  // The slots just drawn, flashing.
  drawnSlots: ReadonlySet<number>
  shuffle: () => void
  // Move the tile in `rackIdx` to display position `insertAt`.
  moveTile: (rackIdx: number, insertAt: number) => void
  // The rack changed under a move: mine (`myMove`, with how many it drew), or
  // somebody else's on the one coop rack (`null`).
  rebuild: (myMove: GMoveSlots | null, nDrawn: number, newLen: number) => void
} {
  const [order, setOrder] = useState(() => Array.from({ length: rack.length },
    (_, i) => i))
  const [drawnMark, flashDrawn] = useMark<{ slots: ReadonlySet<number> }>(
    ATTENTION_FLASH_MS)

  const shuffle = useCallback(() => {
    setOrder((prev) => [...prev].sort(() => Math.random() - 0.5))
  }, [])

  const moveTile = useCallback((rackIdx: number, insertAt: number) => {
    setOrder((prev) => {
      const from = prev.indexOf(rackIdx)
      if (from < 0) return prev
      const next = [...prev]
      next.splice(from, 1)
      // Taking the tile out shifted every later position left by one.
      const to = from < insertAt ? insertAt - 1 : insertAt
      next.splice(Math.min(to, next.length), 0, rackIdx)
      return next
    })
  }, [])

  const rebuild = useCallback((myMove: GMoveSlots | null, nDrawn: number, newLen: number) => {
    setOrder((prev) => makeNextRackOrder(prev, myMove, newLen))
    if (nDrawn > 0 && newLen > 0) {
      // The drawn tiles are the rack's last slots.
      const n = Math.min(nDrawn, newLen)
      flashDrawn({
        slots: new Set(Array.from({ length: n },
          (_, i) => newLen - n + i)),
      })
    }
  }, [flashDrawn])

  return {
    tiles: order.filter((i) => i < rack.length).map((i) => ({
      glyph: rack[i],
      rackIdx: i,
    })),
    drawnSlots: drawnMark === null ? NO_SLOTS : drawnMark.value.slots,
    shuffle,
    moveTile,
    rebuild,
  }
}
