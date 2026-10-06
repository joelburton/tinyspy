// cs-unmet

import { useBindAction } from '@/common/actions/useBindAction'
import type { GTile } from '../types'

/**
 * The board column's two commands, both key-only — a tap or a drag is the
 * board's own swap, so no button draws them and nothing is handed back. Enter
 * (`act-submit`, called "Swap") swaps the two keyboard picks, and ⌫
 * (`act-clear-picks`) drops the picks. Both hide on a board I can't play;
 * Swap goes disabled without two picks or while a swap is out, Clear without
 * a pick.
 */
export function useBoardColActions({
  isInteractive,
  canPick,
  pickedTileIds,
  tilesById,
  swap,
  clearPicks,
}: {
  // My move, on the live board: the actions show.
  isInteractive: boolean
  // …and no swap is out: they act.
  canPick: boolean
  pickedTileIds: readonly string[]
  // The board's tiles, by id.
  tilesById: ReadonlyMap<string, GTile>
  swap: (a: GTile, b: GTile) => void
  clearPicks: () => void
}): void {
  useBindAction('act-submit', {
    describe: () => {
      if (!isInteractive) return 'hidden'
      return {
        state: canPick && pickedTileIds.length === 2 ? 'active' : 'disabled',
        label: 'Swap',
      }
    },
    run: () => {
      const [aId, bId] = pickedTileIds
      if (aId === undefined || bId === undefined || !canPick) return
      swap(tilesById.get(aId)!, tilesById.get(bId)!)
      clearPicks()
    },
  })

  useBindAction('act-clear-picks', {
    describe: () => {
      if (!isInteractive) return 'hidden'
      return pickedTileIds.length > 0 ? 'active' : 'disabled'
    },
    run: clearPicks,
  })
}
