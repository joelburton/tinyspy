// cs-unmet

import { useMemo } from 'react'
import { makeEnding } from '@/common/game-page/makeEnding'
import type { PlayAreaLoaderProps } from '@/common/game-page/playAreaLoaderProps'
import { findFewestMissesAhead, makeEndingLabel } from '../lib/endingLabel'
import { makeSetupRows } from '../lib/setupRows'
import type { GEvent, GFacts, GGameData, GGameDataRaw, GPlayer } from '../types'

/**
 * The seat rule: what a racer may not see yet. Mid-race in compete, a rival's
 * guesses are their strategy, so their rows leave the log and their board is
 * null; the game's end opens everything. Coop withholds nothing: one board,
 * one team.
 */
function maySeeRival(raw: GGameDataRaw): boolean {
  return raw.coop || raw.ended
}

/**
 * Build `gd` from the blob and who I am. Pure, so a test hands it a blob and
 * reads what the surface would.
 */
export function makeGameData(raw: GGameDataRaw, myId: string): GGameData {
  const seeRival = maySeeRival(raw)
  const isMine = (id: string) => id === myId
  // `team` goes onto the players; `gd` has none.
  const { team, turns, ending, ...rest } = raw

  // Each player carries the facts twice (docs/common-schema.md → A player's
  // facts): spread on, the side's — the team's in coop, their own in compete;
  // under `own`, their own. Coop's one board is the same object on every
  // player; a racer's own is theirs alone to see mid-race.
  const gameFacts = { mode: raw.mode, ended: raw.ended, reason: ending?.reason ?? null }
  const players: GPlayer[] = raw.players.map(function makePlayer(p) {
    const endingLabel = makeEndingLabel(p, gameFacts, findFewestMissesAhead(p, raw.players))
    const board = team?.board ?? (seeRival || isMine(p.id) ? p.board : null)
    const own: GFacts = { nMisses: p.nMisses, board }
    return { ...p, ...(team ?? own), board, own, endingLabel }
  })
  const playersById = Object.fromEntries(players.map((p) => [p.id, p]))

  // Every guess is a seated player's: a player's rows go with their profile
  // (`on delete cascade`), so the lookup cannot miss.
  const events: GEvent[] = raw.events
    .filter((e) => seeRival || isMine(e.userId))
    .map(({ userId, ...row }) => ({ ...row, by: playersById[userId]! }))

  // The gate has checked that I am seated, and my own board is never withheld.
  const me = playersById[myId] as GGameData['me']

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
 * place: `static_game_data` holds what create fixed — the common part and the
 * starter half of the puzzle — `game_data` the rest, the answer half included.
 * `puzzle` is in both, so its halves are joined rather than one replacing the
 * other.
 */
function mergeStaticGameData(gameData: unknown, staticGameData: unknown): GGameDataRaw {
  // Each blob holds some of GGameDataRaw's keys; typed whole for the spread.
  const changing = gameData as GGameDataRaw
  const fixed = staticGameData as GGameDataRaw
  return { ...changing, ...fixed, puzzle: { ...fixed.puzzle, ...changing.puzzle } }
}

/**
 * Per-gametype data hook for wordleone (both modes share it): `gd`, built from
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
      `wordleone: game ${ctx.cg.id} has no game_data; run wordleone._rebuild_data_cols_for_all()`)
  }
  const myId = ctx.auth.user.id
  // Rebuilt when the page hands down a new blob, and not on every render.
  const gd = useMemo(
    () => makeGameData(mergeStaticGameData(ctx.gameData, ctx.staticGameData), myId),
    [ctx.gameData, ctx.staticGameData, myId],
  )
  return { gd }
}
