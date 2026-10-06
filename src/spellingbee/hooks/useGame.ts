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
 * rival's finds mid-race, the state line's data is decided once); what is spellingbee's
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
 * Put the page's two blobs back together as `GGameDataRaw`, each key in its
 * place (plans/static-game-data.md): `static_game_data` holds what create
 * fixed — the puzzle whole, since nothing in it waits for the end —
 * `game_data` the rest.
 */
function mergeStaticGameData(gameData: unknown, staticGameData: unknown): GGameDataRaw {
  // Each blob holds some of GGameDataRaw's keys; typed whole for the spread.
  return { ...(gameData as GGameDataRaw), ...(staticGameData as GGameDataRaw) }
}

/**
 * Per-gametype data hook for spellingbee (both modes share it): `gd`, built
 * from the `game_data` and `static_game_data` blobs the page was handed and
 * who I am. No reads and no subscription: the page re-reads `game_data` on
 * every move, and `makeGameData` is a pure function of the two
 * (plans/seat-view.md → The page is written, not assembled).
 *
 * A game whose builder has not written a blob yet cannot be drawn; the throw
 * lands in `PlayAreaErrorBoundary`'s card.
 *
 * The cross-cutting machinery (presence, manual-pause, timer) lives on
 * `useCommonGame` inside `GamePage` — see `src/common/game-page/useCommonGame.ts`.
 */
export function useGame(ctx: PlayAreaLoaderProps): { gd: GGameData } {
  if (ctx.gameData === null) {
    throw new Error(`no game_data; run spellingbee._rebuild_data_cols_for_all()`)
  }
  const myId = ctx.auth.user.id
  // Rebuilt when the page hands down a new blob, and not on every render.
  const gd = useMemo(
    () => makeGameData(mergeStaticGameData(ctx.gameData, ctx.staticGameData), myId),
    [ctx.gameData, ctx.staticGameData, myId],
  )
  return { gd }
}
