// cs-unmet

import { useMemo, useState } from 'react'
import { useBindAction, type Action } from '@/common/actions/useBindAction'
import { makeDrawOrder } from '../lib/board'
import type { GTile } from '../types'

/**
 * The board's rotation: a view-only quarter turn on this player's screen,
 * never persisted or shared — the tiles change places, each letter stays
 * upright. Returns the tiles in the order to draw them, and the Rotate action
 * (its button and ⌥Z).
 *
 * A fresh visual scan of the SAME board, never a move: it writes nothing and
 * reaches nobody else, so it stays active once the game has ended.
 */
export function useBoardRotation(
  tiles: readonly GTile[],
  boardSideSize: number,
): { drawnTiles: GTile[]; actRotate: Action } {
  const [quarterTurns, setQuarterTurns] = useState(0)
  const drawnTiles = useMemo(
    () => makeDrawOrder(boardSideSize, quarterTurns).map((i) => tiles[i]!),
    [tiles, boardSideSize, quarterTurns],
  )
  const actRotate = useBindAction('act-rotate', {
    describe: () => 'active',
    run: () => setQuarterTurns((t) => (t + 1) % 4),
  })
  return { drawnTiles, actRotate }
}
