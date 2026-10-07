// cs-blessed-connections

import { useMemo } from 'react'
import { makeEnding } from '@/common/game-page/makeEnding'
import type { PlayAreaLoaderProps } from '@/common/game-page/playAreaLoaderProps'
import { eventToOutcome } from '../lib/answer'
import { makeSetupRows } from '../lib/setupRows'
import type { GEvent, GFacts, GGameData, GGameDataRaw, GPlayer, GPuzzle } from '../types'

/**
 * The seat rule: what a racer may not see yet. Mid-race in compete, a rival's
 * guesses are their strategy — a peer's one-away guess plus the public puzzle
 * would hand you the answer — so their rows leave the log and their board is
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
  const players: GPlayer[] = raw.players.map(function makePlayer(p) {
    const board = team?.board ?? (seeRival || isMine(p.id) ? p.board : null)
    const own: GFacts = {
      nMatchedCats: p.nMatchedCats,
      nMistakes: p.nMistakes,
      maxMistakes: p.maxMistakes,
      board,
    }
    return { ...p, ...(team ?? own), board, own }
  })
  const playersById = Object.fromEntries(players.map((p) => [p.id, p]))

  // The puzzle's tiles by id, beside the list, as `playersById` sits beside
  // `players`: what a hook holds is an id, and what it hands back is the tile.
  const tilesById = new Map(raw.puzzle.tiles.map((t) => [t.id, t]))
  const puzzle: GPuzzle = { ...raw.puzzle, tilesById }

  // THE INBOUND SEAM: the wire word is read through `lib/answer.ts` here and
  // never travels further; `matched` is derived here too, so no downstream
  // rule has to ask a color whether a category was matched. Every guess is a
  // seated player's: a player's rows go with their profile (`on delete
  // cascade`), so the lookup cannot miss; and a guessed tile is one of the
  // puzzle's sixteen, which `submit_guess` checked, so neither can that one.
  const events: GEvent[] = raw.events
    .filter((e) => seeRival || isMine(e.userId))
    .map(({ userId, tiles, ...row }) => ({
      ...row,
      by: playersById[userId]!,
      tiles: tiles.map((id) => tilesById.get(id)!),
      outcome: eventToOutcome(row),
      matched: row.result === 'correct',
    }))

  // The gate has checked that I am seated, and my own board is never withheld.
  const me = playersById[myId] as GGameData['me']

  return {
    ...rest,
    puzzle,
    setupRows: makeSetupRows(raw.setup, raw.mode, players, raw.puzzle.date),
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
 * place: `static_game_data` holds what create fixed — the puzzle whole, since
 * nothing in it waits for the end — `game_data` the rest.
 */
function mergeStaticGameData(gameData: unknown, staticGameData: unknown): GGameDataRaw {
  // Each blob holds some of GGameDataRaw's keys; typed whole for the spread.
  return { ...(gameData as GGameDataRaw), ...(staticGameData as GGameDataRaw) }
}

/**
 * Per-gametype data hook for connections (both modes share it): `gd`, built
 * from the `game_data` and `static_game_data` blobs the page was handed and
 * who I am. No reads and no subscription: the page re-reads `game_data` on
 * every move, and `makeGameData` is a pure function of the two
 * (plans/seat-view.md → The page is written, not assembled). The picks, this
 * game's one live state, are the board column's (`usePicks`).
 *
 * A game whose builder has not written a blob yet cannot be drawn; the throw
 * lands in `PlayAreaErrorBoundary`'s card.
 *
 * The cross-cutting machinery (presence, manual-pause, timer) lives on
 * `useCommonGame` inside `GamePage` — see `src/common/game-page/useCommonGame.ts`.
 */
export function useGame(ctx: PlayAreaLoaderProps): { gd: GGameData } {
  if (ctx.gameData === null) {
    throw new Error(`no game_data; run connections._rebuild_data_cols_for_all()`)
  }
  const myId = ctx.auth.user.id
  // Rebuilt when the page hands down a new blob, and not on every render.
  const gd = useMemo(
    () => makeGameData(mergeStaticGameData(ctx.gameData, ctx.staticGameData), myId),
    [ctx.gameData, ctx.staticGameData, myId],
  )
  return { gd }
}
