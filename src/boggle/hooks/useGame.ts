// cs-unmet

import { useMemo } from 'react'
import { makeEnding } from '@/common/game-page/makeEnding'
import type { PlayAreaLoaderProps } from '@/common/game-page/playAreaLoaderProps'
import { makeTraceBoard } from '../lib/board'
import { makeSetupRows } from '../lib/setupRows'
import type { GFacts, GFoundWord, GGameData, GGameDataRaw, GPlayer } from '../types'

/**
 * The seat rule: what a racer may not see yet. Mid-race in compete, a rival's
 * finds are their private list — seeing them would hand over words — so their
 * rows leave `foundWords`; their counts stay, since the strip shows them. The
 * game's end opens everything. Coop withholds nothing: one list, one team.
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
  // under `own`, their own.
  const players: GPlayer[] = raw.players.map(function makePlayer(p) {
    const own: GFacts = {
      nFoundWords: p.nFoundWords,
      foundWordsScore: p.foundWordsScore,
      nFoundReqdWords: p.nFoundReqdWords,
      foundReqdWordsScore: p.foundReqdWordsScore,
      nFoundBonusWords: p.nFoundBonusWords,
      foundBonusWordsScore: p.foundBonusWordsScore,
    }
    return { ...p, ...(team ?? own), own }
  })
  const playersById = Object.fromEntries(players.map((p) => [p.id, p]))

  // Every find is a seated player's: a player's rows go with their profile
  // (`on delete cascade`), so the lookup cannot miss.
  const foundWords: GFoundWord[] = raw.foundWords
    .filter((w) => seeRival || isMine(w.userId))
    .map(({ userId, ...row }) => ({ ...row, by: playersById[userId]! }))

  // The gate has checked that I am seated.
  const me = playersById[myId]!

  return {
    ...rest,
    puzzle: {
      ...raw.puzzle,
      tilesById: new Map(raw.puzzle.tiles.map((t) => [t.id, t])),
      traceBoard: makeTraceBoard(raw.puzzle.tiles, raw.puzzle.boardSideSize),
    },
    setupRows: makeSetupRows(raw.setup, raw.mode, players, raw.puzzle),
    turns: turns === null ? null : { holder: playersById[turns.holder]! },
    ending: makeEnding(ending, players),
    foundWords,
    players,
    playersById,
    me,
  }
}

/**
 * Put the page's two blobs back together as `GGameDataRaw`, each key in its
 * place: `static_game_data` holds what create fixed — the puzzle whole, since
 * nothing in it waits for the end — `game_data` the rest.
 */
function mergeStaticGameData(gameData: unknown, staticGameData: unknown): GGameDataRaw {
  // Each blob holds some of GGameDataRaw's keys; typed whole for the spread.
  return { ...(gameData as GGameDataRaw), ...(staticGameData as GGameDataRaw) }
}

/**
 * Per-gametype data hook for boggle (both modes share it): `gd`, built from
 * the `game_data` and `static_game_data` blobs the page was handed and who I
 * am. No reads and no subscription: the page re-reads `game_data` on every
 * move, and `makeGameData` is a pure function of the two (plans/seat-view.md →
 * The page is written, not assembled).
 *
 * A game whose builder has not written a blob yet cannot be drawn; the throw
 * lands in `PlayAreaErrorBoundary`'s card.
 *
 * The cross-cutting machinery (presence, manual-pause, timer) lives on
 * `useCommonGame` inside `GamePage` — see `src/common/game-page/useCommonGame.ts`.
 */
export function useGame(ctx: PlayAreaLoaderProps): { gd: GGameData } {
  if (ctx.gameData === null) {
    throw new Error(`boggle: game ${ctx.cg.id} has no game_data; run boggle._rebuild_data_cols_for_all()`)
  }
  const myId = ctx.auth.user.id
  // Rebuilt when the page hands down a new blob, and not on every render.
  const gd = useMemo(
    () => makeGameData(mergeStaticGameData(ctx.gameData, ctx.staticGameData), myId),
    [ctx.gameData, ctx.staticGameData, myId],
  )
  return { gd }
}
