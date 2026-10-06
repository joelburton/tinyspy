// cs-blessed-codenamesduet

import { useMemo } from 'react'
import type {
  PlayAreaLoaderProps,
} from '@/common/game-page/playAreaLoaderProps'
import { makeSetupRows } from '../lib/setupRows'
import type {
  GBoard,
  GEvent,
  GFacts,
  GGameData,
  GGameDataRaw,
  GPlayer,
  GPuzzleTile,
  GTile,
} from '../types'

/**
 * Build `gd` from the blob and who I am. Pure, so a test hands it a blob and
 * reads what the surface would.
 *
 * The seat rule: my partner's key is theirs until the game ends — the rulebook
 * keeps the two cards apart, and seeing theirs would hand me every agent I am
 * hunting — so it is null on every puzzle tile until then. Everything else on
 * the table is public to both.
 */
export function makeGameData(raw: GGameDataRaw, myId: string): GGameData {
  // `team` goes onto the players; `gd` has none.
  const { team, turns, ending, ...rest } = raw
  const { board: boardRaw, ...counts } = team

  // The one table, the same object on both players. Its tiles name players
  // (who may guess, who an arrow points at), so it is filled once the players
  // exist.
  const tiles: GTile[] = []
  const tilesById = new Map<string, GTile>()
  const board: GBoard = { tiles, tilesById }

  // Each player carries the facts twice (plans/team-facts.md): spread on, the
  // side's; under `own`, their own — the team's, since nothing is stored per
  // player.
  const facts: GFacts = { ...counts, board }
  const players: GPlayer[] = raw.players.map((p) => ({ ...p, ...facts, own: facts }))
  const playersById = Object.fromEntries(players.map((p) => [p.id, p]))
  // Links that cannot miss get a bare lookup: every id the builder writes is a
  // seated player's. An ending's `by` may be null for a timeout.
  const playerOf = (id: string) => playersById[id]!
  const maybePlayerOf = (id: string | null) => (id === null
    ? null
    : playerOf(id))

  // The gate has checked that I am seated, and Duet always seats two.
  const me = playerOf(myId)
  const partner = players.find((p) => p.id !== myId)!

  const puzzleTiles: GPuzzleTile[] = raw.puzzle.tiles.map((t) => ({
    ...t,
    key: raw.ended ? t.key : { ...t.key, [partner.id]: null },
  }))
  const puzzleTilesById = new Map(puzzleTiles.map((t) => [t.id, t]))

  for (const t of boardRaw.tiles) {
    const tile: GTile = {
      id: t.id,
      puzzleTile: puzzleTilesById.get(t.id)!,
      revealed: t.revealed === null
        ? null
        : { as: t.revealed.as, arrows: new Set(t.revealed.arrows.map(playerOf)) },
      guessableBy: new Set(t.guessableBy.map(playerOf)),
    }
    tiles.push(tile)
    tilesById.set(tile.id, tile)
  }

  const events: GEvent[] = raw.events.map(({ userId, ...row }) => ({
    ...row,
    by: playerOf(userId),
  }))

  return {
    ...rest,
    setupRows: makeSetupRows(raw.setup, raw.mode, players),
    puzzle: { tiles: puzzleTiles, tilesById: puzzleTilesById },
    turns: {
      holder: maybePlayerOf(turns.holder),
      num: turns.num,
      currClue: turns.currClue === null
        ? null
        : {
          word: turns.currClue.word,
          count: turns.currClue.count,
          fromAi: turns.currClue.fromAi,
          by: playerOf(turns.currClue.userId),
        },
    },
    events,
    ending: ending === null
      ? null
      : {
        reason: ending.reason,
        detail: ending.detail,
        by: maybePlayerOf(ending.by),
        winner: maybePlayerOf(ending.winner),
      },
    players,
    playersById,
    me,
    partner,
  }
}

/**
 * Put the page's two blobs back together as `GGameDataRaw`, each key in its
 * place: `static_game_data` holds what create fixed — the deal whole, since it
 * never changes — `game_data` the rest.
 */
function mergeStaticGameData(gameData: unknown, staticGameData: unknown): GGameDataRaw {
  // Each blob holds some of GGameDataRaw's keys; typed whole for the spread.
  return { ...(gameData as GGameDataRaw), ...(staticGameData as GGameDataRaw) }
}

/**
 * Per-gametype data hook for codenamesduet: `gd`, built from the `game_data`
 * and `static_game_data` blobs the page was handed and who I am. No reads and
 * no subscription: the page re-reads `game_data` on every move, and
 * `makeGameData` is a pure function of the two (plans/seat-view.md → The page
 * is written, not assembled).
 *
 * A game whose builder has not written a blob yet cannot be drawn; the throw
 * lands in `PlayAreaErrorBoundary`'s card.
 */
export function useGame(ctx: PlayAreaLoaderProps): { gd: GGameData } {
  if (ctx.gameData === null) {
    throw new Error(
      `codenamesduet: game ${ctx.cg.id} has no game_data; run codenamesduet._rebuild_data_cols_for_all()`,
    )
  }
  const myId = ctx.auth.user.id
  // Rebuilt when the page hands down a new blob, and not on every render.
  const gd = useMemo(
    () => makeGameData(mergeStaticGameData(ctx.gameData, ctx.staticGameData), myId),
    [ctx.gameData, ctx.staticGameData, myId],
  )
  return { gd }
}
