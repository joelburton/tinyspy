// cs-unmet

import { useMemo } from 'react'
import type { PlayAreaLoaderProps } from '@/common/game-page/playAreaLoaderProps'
import { makeBeeGameData } from '@/shared/bee-games/beeGameData'
import { makeSetupRows } from '../lib/setupRows'
import type { GGameData, GGameDataRaw } from '../types'

/**
 * Build `gd` from the blob and who I am. Pure, so a test hands it a blob and
 * reads what the surface would. The reading is the bee games' shared one
 * (`makeBeeGameData`: the links become players, the seat rule withholds a
 * rival's finds mid-race, the readout is decided once); what is wordwheel's
 * is its setup rows, built from its setup and its board's letters.
 */
export function makeGameData(raw: GGameDataRaw, myId: string): GGameData {
  return makeBeeGameData(raw, myId, (players) =>
    makeSetupRows(raw.setup, raw.mode, players, {
      center: raw.puzzle.centerLetter,
      outer: raw.puzzle.outerLetters,
    }),
  )
}

/**
 * Per-gametype data hook for wordwheel (both modes share it): `gd`, built
 * from the `game_data` blob the page was handed and who I am. No reads and no
 * subscription: the page re-reads the blob on every move, and `makeGameData`
 * is a pure function of it (plans/seat-view.md → The page is written, not
 * assembled).
 *
 * A game whose builder has not written a blob yet cannot be drawn; the throw
 * lands in `PlayAreaErrorBoundary`'s card.
 *
 * The cross-cutting machinery (presence, manual-pause, timer) lives on
 * `useCommonGame` inside `GamePage` — see `src/common/game-page/useCommonGame.ts`.
 */
export function useGame(ctx: PlayAreaLoaderProps): { gd: GGameData } {
  const raw = ctx.gameData as GGameDataRaw | null
  if (raw === null) {
    throw new Error(`no game_data; run wordwheel._rebuild_data_cols_for_all()`)
  }
  const myId = ctx.auth.user.id
  // Rebuilt when the page hands down a new blob, and not on every render.
  const gd = useMemo(() => makeGameData(raw, myId), [raw, myId])
  return { gd }
}
