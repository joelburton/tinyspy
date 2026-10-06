// cs-unmet

import { useEffect, useRef } from 'react'
import type { useRackOrder } from './useRackOrder'
import type { useStagedTiles } from './useStagedTiles'
import type { useSubmitMove } from './useSubmitMove'
import type { GGameData, GHistoryView } from '../types'

/**
 * What the board column does when a move lands — any move, anyone's, read off
 * the board's `version` going up in the blob:
 *
 *   - back to the live board, the picks dropped, and my just-played tiles let
 *     go (the blob has them now);
 *   - **mine** — or anyone's on coop's one rack — clears what was staged and
 *     rebuilds the rack's order: what stayed stays put, what was drawn goes
 *     on the right and flashes;
 *   - **an opponent's** leaves my rack and my laid-out move alone, unless it
 *     took a cell I had staged on.
 *
 * Which move was mine is the claim `useSubmitMove` took before its RPC went
 * out, taken here once.
 */
export function useLandMove({
  gd,
  rack,
  historyView,
  submission,
  staged,
  rackOrder,
}: {
  gd: GGameData
  // The rack I play from, by slot.
  rack: readonly string[]
  historyView: GHistoryView
  submission: ReturnType<typeof useSubmitMove>
  staged: ReturnType<typeof useStagedTiles>
  rackOrder: ReturnType<typeof useRackOrder>
}): void {
  const landedVersionRef = useRef(gd.version)

  // Each is stable; named one by one so the effect lists them as it reads them.
  const exitHistory = historyView.exit
  const { takeMyMove, clearHeldTiles } = submission
  const { clearPicks, recallAll, dropIfCovered } = staged
  const rebuildRack = rackOrder.rebuild

  useEffect(function landMove() {
    if (landedVersionRef.current === gd.version) return
    landedVersionRef.current = gd.version
    clearPicks()
    exitHistory()
    clearHeldTiles()
    const myMove = takeMyMove()
    if (gd.compete && myMove === null) {
      dropIfCovered(gd.board.cells)
      return
    }
    recallAll()
    rebuildRack(myMove?.slots ?? null, myMove?.nDrawn ?? 0, rack.length)
  }, [gd.version, gd.compete, gd.board.cells, rack.length, clearPicks, exitHistory,
    clearHeldTiles, takeMyMove, dropIfCovered, recallAll, rebuildRack])
}
