// cs-unmet

import { useMemo } from 'react'
import type {
  PlayAreaLoaderProps,
} from '@/common/game-page/playAreaLoaderProps'
import { makeSetupRows } from '../lib/setupRows'
import type {
  GEvent,
  GGameData,
  GGameDataRaw,
  GPlayer,
  GStateLineData,
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
  const players: GPlayer[] = raw.players.map((p) => (
    raw.ended || p.id === myId ? p : { ...p, tiles: null, board: null }
  ))
  const playersById = Object.fromEntries(players.map((p) => [p.id, p]))

  // Links that cannot miss get a bare lookup; an ending's `by` is null for a
  // timeout.
  const playerOf = (id: string | null) => (
    id === null
      ? null
      : playersById[id]!)

  // Every row is a seated player's: a player's rows go with their profile
  // (`on delete cascade`), so the lookup cannot miss.
  const events: GEvent[] = raw.events.map(({ userId, ...row }) => ({
    ...row,
    by: playersById[userId]!,
  }))

  // The gate has checked that I am seated, and my own letters are never
  // withheld.
  const me = playersById[myId]! as GGameData['me']
  // What the state line shows: my tiles against the two piles.
  const stateLineData: GStateLineData = {
    nTiles: me.nTiles,
    nBunchTiles: raw.nBunchTiles,
    nBagTiles: raw.nBagTiles,
  }

  const { turns, ending, ...rest } = raw
  return {
    ...rest,
    setupRows: makeSetupRows(raw.setup, raw.mode, players),
    turns: turns === null ? null : { holder: playersById[turns.holder]! },
    ending: ending === null
      ? null
      : {
        reason: ending.reason,
        detail: ending.detail,
        by: playerOf(ending.by),
        winner: playerOf(ending.winner),
      },
    events,
    players,
    playersById,
    me,
    stateLineData,
  }
}

/**
 * Per-gametype data hook for bananagrams: `gd`, built from the `game_data` blob
 * the page was handed and who I am. No reads and no subscription: the page
 * re-reads the blob on every move and every board save, and this is a pure
 * function of it (plans/seat-view.md → The page is written, not assembled). My
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
  const raw = ctx.gameData as GGameDataRaw | null
  if (raw === null) {
    throw new Error(
      `no game_data; run bananagrams._rebuild_data_cols_for_all()`)
  }
  const myId = ctx.auth.user.id
  // Rebuilt when the page hands down a new blob, and not on every render.
  const gd = useMemo(() => makeGameData(raw, myId), [raw, myId])
  return { gd }
}
