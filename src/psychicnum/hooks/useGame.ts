// cs-blessed-psychicnum

import { useMemo } from 'react'
import type { PlayAreaLoaderProps } from '@/common/game-page/playAreaLoaderProps'
import { getGuessOutcome } from '../lib/answer'
import { makeSetupRows } from '../lib/setupRows'
import type { GEvent, GGameData, GGameDataRaw, GPlayer } from '../types'

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

  // The players first, boards empty, so a tile's `decidedBy` can point at
  // them; then each board, from the blob's tiles.
  const players: GPlayer[] = raw.players.map((p) => ({ ...p, board: null }))
  const playersById = Object.fromEntries(players.map((p) => [p.id, p]))
  for (const [i, p] of raw.players.entries()) {
    if (!seeRival && !isMine(p.id)) continue
    const tiles = p.board.tiles.map((t) => ({
        id: t.id,
        word: t.word,
        correct: t.correct,
        // THE INBOUND SEAM for a tile's color: read once here, through
        // `lib/answer.ts`, so the board draws it and decides nothing.
        outcome: t.correct === null ? null : getGuessOutcome(t.word, t.correct),
        // Every guess is a seated player's: a player's rows go with their
        // profile (`on delete cascade`), so the lookup cannot miss.
        decidedBy: t.decidedBy === null ? null : playersById[t.decidedBy]!,
      }))
    players[i]!.board = { tiles, tilesById: new Map(tiles.map((t) => [t.id, t])) }
  }

  // Links that cannot miss get a bare lookup; an ending's `by` may be null for
  // a timeout.
  const playerOf = (id: string | null) => (id === null ? null : playersById[id]!)

  const events: GEvent[] = raw.events
    .filter((e) => seeRival || isMine(e.userId))
    .map(({ userId, ...row }) => ({ ...row, by: playersById[userId]! }))

  // The gate has checked that I am seated, and my own board is never withheld.
  const me = playersById[myId] as GGameData['me']
  // What the state line shows: the team's counts where the game has one, else
  // my own (plans/team-facts.md).
  const teamOrMe = raw.team ?? me

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
    stateLineData: {
      nFoundSecrets: teamOrMe.nFoundSecrets,
      nReqdSecrets: me.nReqdSecrets,
      nGuessesUsed: teamOrMe.nGuessesUsed,
      maxGuesses: me.maxGuesses,
    },
  }
}

/**
 * Put the page's two blobs back together as `GGameDataRaw`, each key in its
 * place (plans/static-game-data.md): `static_game_data` holds what create
 * fixed, `game_data` the rest. The puzzle is split across both — its words are
 * static, its secrets arrive in `game_data` once the game has ended.
 */
function mergeStaticGameData(gameData: unknown, staticGameData: unknown): GGameDataRaw {
  // Each blob holds some of GGameDataRaw's keys; typed whole for the spread.
  const changing = gameData as GGameDataRaw
  const fixed = staticGameData as GGameDataRaw
  return { ...changing, ...fixed, puzzle: { ...fixed.puzzle, ...changing.puzzle } }
}

/**
 * Per-gametype data hook for psychicnum (both modes share it): `gd`, built
 * from the `game_data` and `static_game_data` blobs the page was handed and
 * who I am. No reads and no subscription: the page re-reads `game_data` on
 * every move, and this is a pure function of the two (plans/seat-view.md →
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
    throw new Error(`psychicnum: game ${ctx.cg.id} has no game_data; run psychicnum._rebuild_data_cols_for_all()`)
  }
  const myId = ctx.auth.user.id
  // Rebuilt when the page hands down a new blob, and not on every render.
  const gd = useMemo(
    () => makeGameData(mergeStaticGameData(ctx.gameData, ctx.staticGameData), myId),
    [ctx.gameData, ctx.staticGameData, myId],
  )
  return { gd }
}
