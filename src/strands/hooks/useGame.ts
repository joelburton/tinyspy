// cs-unmet

import { useMemo } from 'react'
import type { PlayAreaLoaderProps } from '@/common/game-page/playAreaLoaderProps'
import { makeSetupRows } from '../lib/setupRows'
import type {
  GBoard,
  GBoardRaw,
  GEvent,
  GGameData,
  GGameDataRaw,
  GHintBarData,
  GPlayer,
  GStateLineData,
  GTile,
  GPuzzleWord,
  GPuzzleWordRaw,
} from '../types'

/**
 * The seat rule: what a racer may not see yet. Mid-race in compete, a rival's
 * finds, hint bar and ringed hint are their race, so their rows leave the log
 * and their board, bar and found-word count are null; how many hints they
 * have cashed stays, the one number a race publishes. The game's end opens
 * everything. Coop withholds nothing: one board, one team.
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
  const tilesById = Object.fromEntries(raw.puzzle.tiles.map((t) => [t.id, t]))
  // Every id in the blob is one of the puzzle's tiles.
  const tilesOf = (ids: readonly string[]): GTile[] => ids.map((id) => tilesById[id]!)
  const makePuzzleWord = ({ tileIds, ...puzzleWord }: GPuzzleWordRaw): GPuzzleWord => ({
    ...puzzleWord,
    tiles: tilesOf(tileIds),
  })
  const boardOf = (board: GBoardRaw): GBoard => ({
    foundPuzzleWords: board.foundPuzzleWords.map(makePuzzleWord),
    hintTiles: board.hintTileIds === null ? null : tilesOf(board.hintTileIds),
  })

  const players: GPlayer[] = raw.players.map((p) => {
    const mayShow = seeRival || isMine(p.id)
    return {
      ...p,
      nFoundPuzzleWords: mayShow ? p.nFoundPuzzleWords : null,
      hintPoints: mayShow ? p.hintPoints : null,
      board: mayShow ? boardOf(p.board) : null,
    }
  })
  const playersById = Object.fromEntries(players.map((p) => [p.id, p]))

  // Links that cannot miss get a bare lookup; an ending's `by` may be null for
  // a timeout.
  const playerOf = (id: string | null) => (id === null
    ? null
    : playersById[id]!)

  // Every row is a seated player's: a player's rows go with their profile
  // (`on delete cascade`), so the lookup cannot miss.
  const events: GEvent[] = raw.events
    .filter((e) => seeRival || isMine(e.userId))
    .map(({ userId, tileIds, ...row }) => ({
      ...row,
      by: playersById[userId]!,
      tiles: tilesOf(tileIds),
    }))

  // The gate has checked that I am seated, and my own board and count are
  // never withheld.
  const me = playersById[myId] as GGameData['me']
  // What the state line and the hint bar show: the team's where the game has a
  // team, else my own (plans/team-facts.md).
  const stateLineData: GStateLineData = raw.team === null
    ? { nFoundPuzzleWords: me.nFoundPuzzleWords, nHintsUsed: me.nHintsUsed }
    : { nFoundPuzzleWords: raw.team.nFoundPuzzleWords, nHintsUsed: raw.team.nHintsUsed }
  const hintBarData: GHintBarData = {
    // A racer's bar is their own; coop's is the team's.
    hintPoints: raw.team === null ? me.hintPoints! : raw.team.hintPoints,
    hintCost: raw.setup.hint_cost,
  }

  const { turns, ending, ...rest } = raw
  return {
    ...rest,
    puzzle: {
      title: raw.puzzle.title,
      tiles: raw.puzzle.tiles,
      tilesById,
      puzzleWords: raw.puzzle.puzzleWords === null ? null : raw.puzzle.puzzleWords.map(makePuzzleWord),
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
    hintBarData,
  }
}

/**
 * Put the page's two blobs back together as `GGameDataRaw`, each key in its
 * place (plans/static-game-data.md): `static_game_data` holds what create
 * fixed, `game_data` the rest. The puzzle is split across both — the prompt
 * and the tiles are static, the puzzle words arrive in `game_data` once the
 * game has ended.
 */
function mergeStaticGameData(gameData: unknown, staticGameData: unknown): GGameDataRaw {
  // Each blob holds some of GGameDataRaw's keys; typed whole for the spread.
  const changing = gameData as GGameDataRaw
  const fixed = staticGameData as GGameDataRaw
  return { ...changing, ...fixed, puzzle: { ...fixed.puzzle, ...changing.puzzle } }
}

/**
 * Per-gametype data hook for strands (both modes share it): `gd`, built from
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
      `strands: game ${ctx.cg.id} has no game_data; run strands._rebuild_data_cols_for_all()`)
  }
  const myId = ctx.auth.user.id
  // Rebuilt when the page hands down a new blob, and not on every render.
  const gd = useMemo(
    () => makeGameData(mergeStaticGameData(ctx.gameData, ctx.staticGameData), myId),
    [ctx.gameData, ctx.staticGameData, myId],
  )
  return { gd }
}
