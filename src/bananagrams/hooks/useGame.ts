// cs-unmet

import { useMemo } from 'react'
import { makeEnding } from '@/common/game-page/makeEnding'
import type {
  PlayAreaLoaderProps,
} from '@/common/game-page/playAreaLoaderProps'
import { makeEndingLabel } from '../lib/endingLabel'
import { makeSetupRows } from '../lib/setupRows'
import type {
  GEvent,
  GFacts,
  GGameData,
  GGameDataRaw,
  GPlayer,
} from '../types'

/**
 * Build `gd` from the blob and who I am. Pure, so a test hands it a blob and
 * reads what the surface would.
 *
 * The seat rule: a rival's `tiles` and `board` are null until the game ends —
 * the blob carries every seat's letters, and this is where a seat stops seeing
 * the others'. Their two counts stay, so the strip shows how close each racer
 * is. At the end every board shows, for the printout.
 */
export function makeGameData(raw: GGameDataRaw, myId: string): GGameData {
  // The piles and `team` (always null: compete only) go onto the players; `gd`
  // has none of them.
  const { nBunchTiles, nBagTiles, team, turns, ending, ...rest } = raw

  // Each player carries the facts twice (docs/common-schema.md → A player's
  // facts): spread on, the side's; under `own`, their own — the same, since a
  // racer's side is themselves. The piles are one for every racer.
  const gameFacts = { ended: raw.ended, reason: ending?.reason ?? null }
  const players: GPlayer[] = raw.players.map(function makePlayer(p) {
    const endingLabel = makeEndingLabel(p, gameFacts)
    const maySee = raw.ended || p.id === myId
    const own: GFacts = {
      tiles: maySee ? p.tiles : null,
      nTiles: p.nTiles,
      nUnplacedTiles: p.nUnplacedTiles,
      board: maySee ? p.board : null,
      nBunchTiles,
      nBagTiles,
    }
    return { ...p, ...(team ?? own), own, endingLabel }
  })
  const playersById = Object.fromEntries(players.map((p) => [p.id, p]))

  // Every row is a seated player's: a player's rows go with their profile
  // (`on delete cascade`), so the lookup cannot miss.
  const events: GEvent[] = raw.events.map(({ userId, ...row }) => ({
    ...row,
    by: playersById[userId]!,
  }))

  // The gate has checked that I am seated, and my own letters are never
  // withheld.
  const me = playersById[myId]! as GGameData['me']

  return {
    ...rest,
    setupRows: makeSetupRows(raw.setup, raw.mode, players),
    turns: turns === null ? null : { holder: playersById[turns.holder]! },
    ending: makeEnding(ending, players),
    events,
    players,
    playersById,
    me,
  }
}

/**
 * Put the page's two blobs back together as `GGameDataRaw`, each key in its
 * place: `static_game_data` holds what create fixed — the common part alone,
 * since bananagrams has no puzzle — `game_data` the rest.
 */
function mergeStaticGameData(gameData: unknown, staticGameData: unknown): GGameDataRaw {
  // Each blob holds some of GGameDataRaw's keys; typed whole for the spread.
  return { ...(gameData as GGameDataRaw), ...(staticGameData as GGameDataRaw) }
}

/**
 * Per-gametype data hook for bananagrams: `gd`, built from the `game_data` and
 * `static_game_data` blobs the page was handed and who I am. No reads and no
 * subscription: the page re-reads `game_data` on every move and every board
 * save, and this is a pure function of the two (plans/seat-view.md → The page
 * is written, not assembled). My
 * board as I edit it is not here: `useEditingBoard` seeds it from
 * `gd.me.board.letters` once and owns it after.
 *
 * A game whose builder has not written a blob yet cannot be drawn; the throw
 * lands in `PlayAreaErrorBoundary`'s card.
 *
 * The cross-cutting machinery (presence, manual-pause, timer) lives on
 * `useCommonGame` inside `GamePage` — see `src/common/game-page/useCommonGame.ts`.
 */
export function useGame(ctx: PlayAreaLoaderProps): { gd: GGameData } {
  if (ctx.gameData === null) {
    throw new Error(
      `no game_data; run bananagrams._rebuild_data_cols_for_all()`)
  }
  const myId = ctx.auth.user.id
  // Rebuilt when the page hands down a new blob, and not on every render.
  const gd = useMemo(
    () => makeGameData(mergeStaticGameData(ctx.gameData, ctx.staticGameData), myId),
    [ctx.gameData, ctx.staticGameData, myId],
  )
  return { gd }
}
