// cs-unmet

import { useMemo } from 'react'
import { makeEnding } from '@/common/game-page/makeEnding'
import type {
  PlayAreaLoaderProps,
} from '@/common/game-page/playAreaLoaderProps'
import { makeEndingLabel } from '../lib/endingLabel'
import { makeSetupRows } from '../lib/setupRows'
import type { GBoard, GEvent, GFacts, GGameData, GGameDataRaw, GPlayer } from '../types'

/**
 * Build `gd` from the blob and who I am. Pure, so a test hands it a blob and
 * reads what the surface would.
 *
 * There is no seat rule: the table is face-up and every claim was made in
 * front of everyone, so every row and count is public in both modes.
 */
export function makeGameData(raw: GGameDataRaw, myId: string): GGameData {
  // `team`, the table and the deck go onto the players; `gd` has none of them.
  const { team, board: boardRaw, nTilesInDeck, turns, ending, ...rest } = raw

  // The one table, shared in both modes: made once, the same object on every
  // player.
  const board: GBoard = {
    tiles: boardRaw.tiles,
    tilesById: Object.fromEntries(boardRaw.tiles.map((t) => [t.id, t])),
  }

  // Each player carries the facts twice (docs/common-schema.md → A player's
  // facts): spread on, the side's — the team's in coop, their own in compete;
  // under `own`, their own.
  const gameFacts = {
    mode: raw.mode,
    ended: raw.ended,
    reason: ending?.reason ?? null,
  }
  const players: GPlayer[] = raw.players.map(function makePlayer(p) {
    const own: GFacts = { nSetsFound: p.nSetsFound, nHintsUsed: p.nHintsUsed, board, nTilesInDeck }
    const tiedWithNames = raw.players
      .filter((o) => o.id !== p.id && p.finalRanking !== null && o.finalRanking === p.finalRanking)
      .map((o) => o.username)
    const endingLabel = makeEndingLabel(p, gameFacts, tiedWithNames)
    return { ...p, ...own, ...team, own, endingLabel }
  })
  const playersById = Object.fromEntries(players.map((p) => [p.id, p]))

  // Every row is a seated player's: a player's rows go with their profile
  // (`on delete cascade`), so the lookup cannot miss.
  const events: GEvent[] = raw.events.map(({ userId, ...row }) => ({
    ...row,
    by: playersById[userId]!,
  }))

  // The gate has checked that I am seated.
  const me = playersById[myId]!

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
 * since setgame has no puzzle — `game_data` the rest.
 */
function mergeStaticGameData(gameData: unknown, staticGameData: unknown): GGameDataRaw {
  // Each blob holds some of GGameDataRaw's keys; typed whole for the spread.
  return { ...(gameData as GGameDataRaw), ...(staticGameData as GGameDataRaw) }
}

/**
 * Per-gametype data hook for setgame (both modes share it): `gd`, built from
 * the `game_data` and `static_game_data` blobs the page was handed and who I
 * am. No reads and no subscription: the page re-reads `game_data` on every
 * move, and this is a pure function of the two (plans/seat-view.md → The page
 * is written, not assembled).
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
      `no game_data; run setgame._rebuild_data_cols_for_all()`)
  }
  const myId = ctx.auth.user.id
  // Rebuilt when the page hands down a new blob, and not on every render.
  const gd = useMemo(
    () => makeGameData(mergeStaticGameData(ctx.gameData, ctx.staticGameData), myId),
    [ctx.gameData, ctx.staticGameData, myId],
  )
  return { gd }
}
