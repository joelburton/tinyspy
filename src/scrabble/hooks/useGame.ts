// cs-unmet

import { useMemo } from 'react'
import type {
  PlayAreaLoaderProps,
} from '@/common/game-page/playAreaLoaderProps'
import { decodeBoard, decodePlacement } from '../lib/board'
import { makeSetupRows } from '../lib/setupRows'
import type { GEvent, GGameData, GGameDataRaw, GPlayer, GStateLineData } from '../types'

/**
 * Build `gd` from the blob and who I am. Pure, so a test hands it a blob and
 * reads what the surface would.
 *
 * The seat rule: in a race, a rival's rack is null until the game ends — the
 * blob carries every rack, and this is where a seat stops seeing the others'.
 * Their rack's count stays. Coop has one rack, the team's, and it is public.
 */
export function makeGameData(raw: GGameDataRaw, myId: string): GGameData {
  const players: GPlayer[] = raw.players.map((p) => (
    raw.ended || p.id === myId ? p : { ...p, rack: null }
  ))
  const playersById = Object.fromEntries(players.map((p) => [p.id, p]))

  // Links that cannot miss get a bare lookup; an ending's `by` may be null for
  // a timeout.
  const playerOf = (id: string | null) => (id === null
    ? null
    : playersById[id]!)

  // Every row is a seated player's: a player's rows go with their profile
  // (`on delete cascade`), so the lookup cannot miss.
  const events: GEvent[] = raw.events.map(({ userId, placements, ...row }) => ({
    ...row,
    by: playersById[userId]!,
    placements: placements === null ? null : placements.map(decodePlacement),
  }))

  const cells = decodeBoard(raw.board.letters)

  // The gate has checked that I am seated.
  const me = playersById[myId]!
  // What the state line shows: the team's score where the game has a team;
  // compete leads with the turn and shows no score.
  const stateLineData: GStateLineData = {
    score: raw.team === null ? null : raw.team.score,
    nBagTiles: raw.nBagTiles,
  }

  const { turns, ending, ...rest } = raw
  return {
    ...rest,
    board: {
      cells,
      cellsById: Object.fromEntries(cells.map((c) => [c.id, c])),
    },
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
 * Per-gametype data hook for scrabble (both modes share it): `gd`, built from
 * the `game_data` blob the page was handed and who I am. No reads and no
 * subscription: the page re-reads the blob on every move, and this is a pure
 * function of it (plans/seat-view.md → The page is written, not assembled).
 * A coop teammate's shown move is not here: it is never stored, and rides its
 * own Broadcast (`useShowMove`).
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
      `no game_data; run scrabble._rebuild_data_cols_for_all()`)
  }
  const myId = ctx.auth.user.id
  // Rebuilt when the page hands down a new blob, and not on every render.
  const gd = useMemo(() => makeGameData(raw, myId), [raw, myId])
  return { gd }
}
