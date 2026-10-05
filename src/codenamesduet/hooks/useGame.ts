// cs-unmet

import { useMemo } from 'react'
import type { PlayAreaLoaderProps } from '@/common/game-page/playAreaLoaderProps'
import { TOTAL_AGENTS } from '../lib/agents'
import { makeSetupRows } from '../lib/setupRows'
import type { GEvent, GGameData, GGameDataRaw, GPlayer, GPuzzleTile, GTile } from '../types'

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
  const players: GPlayer[] = raw.players
  const playersById = Object.fromEntries(players.map((p) => [p.id, p]))
  // Links that cannot miss get a bare lookup: every id the builder writes is a
  // seated player's. An ending's `by` may be null for a timeout.
  const playerOf = (id: string) => playersById[id]!
  const maybePlayerOf = (id: string | null) => (id === null ? null : playerOf(id))

  // The gate has checked that I am seated, and Duet always seats two.
  const me = playerOf(myId)
  const partner = players.find((p) => p.id !== myId)!

  const puzzleTiles: GPuzzleTile[] = raw.puzzle.tiles.map((t) => ({
    ...t,
    key: raw.ended ? t.key : { ...t.key, [partner.id]: null },
  }))
  const puzzleTilesById = new Map(puzzleTiles.map((t) => [t.id, t]))

  const boardTiles: GTile[] = raw.team.board.tiles.map((t) => ({
    id: t.id,
    puzzleTile: puzzleTilesById.get(t.id)!,
    revealed: t.revealed === null
      ? null
      : { as: t.revealed.as, arrows: new Set(t.revealed.arrows.map(playerOf)) },
    guessable: t.guessableBy.includes(myId),
  }))

  const events: GEvent[] = raw.events.map(({ userId, ...row }) => ({ ...row, by: playerOf(userId) }))

  const { turns, ending, ...rest } = raw
  return {
    ...rest,
    setupRows: makeSetupRows(raw.setup, raw.mode, players),
    puzzle: { tiles: puzzleTiles, tilesById: puzzleTilesById },
    team: {
      ...raw.team,
      board: { tiles: boardTiles, tilesById: new Map(boardTiles.map((t) => [t.id, t])) },
    },
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
    stateLineData: {
      nFoundAgents: raw.team.nFoundAgents,
      nAgents: TOTAL_AGENTS,
      nTurnsUsed: raw.team.nTurnsUsed,
      maxTurns: raw.team.maxTurns,
      suddenDeath: raw.team.suddenDeath,
    },
  }
}

/**
 * Per-gametype data hook for codenamesduet: `gd`, built from the `game_data`
 * blob the page was handed and who I am. No reads and no subscription: the
 * page re-reads the blob on every move, and `makeGameData` is a pure function
 * of it (plans/seat-view.md → The page is written, not assembled).
 *
 * A game whose builder has not written a blob yet cannot be drawn; the throw
 * lands in `PlayAreaErrorBoundary`'s card.
 */
export function useGame(ctx: PlayAreaLoaderProps): { gd: GGameData } {
  const raw = ctx.gameData as GGameDataRaw | null
  if (raw === null) {
    throw new Error(
      `codenamesduet: game ${ctx.cg.id} has no game_data; run codenamesduet._rebuild_data_cols_for_all()`,
    )
  }
  const myId = ctx.auth.user.id
  // Rebuilt when the page hands down a new blob, and not on every render.
  const gd = useMemo(() => makeGameData(raw, myId), [raw, myId])
  return { gd }
}
