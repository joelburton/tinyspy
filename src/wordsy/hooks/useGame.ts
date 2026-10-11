// cs-unmet

import { useMemo } from 'react'
import { makeEnding } from '@/common/game-page/makeEnding'
import type { PlayAreaLoaderProps } from '@/common/game-page/playAreaLoaderProps'
import { makeEndingLabel } from '../lib/endingLabel'
import { makeSetupRows } from '../lib/setupRows'
import type { GEvent, GFacts, GGameData, GGameDataRaw, GPlayer, GRound } from '../types'

/**
 * Build `gd` from the blob and who I am. Pure, so a test hands it a blob and
 * reads what the surface would.
 *
 * The seat rule: every seat's standing word is in the blob while the round is
 * open, since one blob serves every seat, and this is where a rival's is
 * dropped — the rulebook's words are written face down until the clock runs
 * out (plans/seat-view.md → The security line is `useGame`). Whether a rival
 * has submitted stays: the strip shows who is in.
 */
export function makeGameData(raw: GGameDataRaw, myId: string): GGameData {
  // `team` (always null: compete only) goes onto the players; `gd` has none.
  const { team, turns, ending, ...rest } = raw

  const gameFacts = { ended: raw.ended, reason: ending?.reason ?? null }
  const players: GPlayer[] = raw.players.map(function makePlayer(p) {
    const own: GFacts = {
      total: p.total,
      nBonuses: p.nBonuses,
      roundScores: p.roundScores,
      hasSubmitted: p.hasSubmitted,
      word: p.id === myId ? p.word : null,
      isWordFrozen: p.isWordFrozen,
      isBlockedByNoFlip: p.isBlockedByNoFlip,
      isReadyForNextRound: p.isReadyForNextRound,
    }
    const tiedWithNames = raw.players
      .filter((o) => o.id !== p.id && p.finalRanking !== null && o.finalRanking === p.finalRanking)
      .map((o) => o.username)
    // Spread on, the side's facts — a racer's side is themselves — and under
    // `own`, their own (docs/common-schema.md → A player's facts).
    return { ...p, ...(team ?? own), own, endingLabel: makeEndingLabel(p, gameFacts, tiedWithNames) }
  })
  const playersById = Object.fromEntries(players.map((p) => [p.id, p]))

  // A round's links are seated players: the round's foreign keys are to
  // wordsy.players, so the lookups cannot miss.
  const rounds: GRound[] = raw.rounds.map((r) => ({
    ...r,
    tilesById: Object.fromEntries(r.tiles.map((t) => [t.id, t])),
    fastest: r.fastest === null ? null : playersById[r.fastest]!,
    noFlipHolder: r.noFlipHolder === null ? null : playersById[r.noFlipHolder]!,
  }))

  // Every row is a seated player's: a player's rows go with their profile
  // (`on delete cascade`), so the lookup cannot miss.
  const events: GEvent[] = raw.events.map(({ userId, ...row }) => ({
    ...row,
    by: playersById[userId]!,
  }))

  return {
    ...rest,
    setupRows: makeSetupRows(raw.setup, raw.mode, players),
    turns: turns === null ? null : { holder: playersById[turns.holder]! },
    ending: makeEnding(ending, players),
    rounds,
    // Round 1 is dealt at create, so there is always a last round.
    round: rounds.at(-1)!,
    isBetweenRounds: !raw.ended && rounds.at(-1)!.ended,
    events,
    players,
    playersById,
    // The gate has checked that I am seated.
    me: playersById[myId]!,
  }
}

/**
 * Put the page's two blobs back together as `GGameDataRaw`, each key in its
 * place: `static_game_data` holds what create fixed — the common part alone,
 * since a round's table changes every round — `game_data` the rest.
 */
function mergeStaticGameData(gameData: unknown, staticGameData: unknown): GGameDataRaw {
  // Each blob holds some of GGameDataRaw's keys; typed whole for the spread.
  return { ...(gameData as GGameDataRaw), ...(staticGameData as GGameDataRaw) }
}

/**
 * Per-gametype data hook for wordsy: `gd`, built from the `game_data` and
 * `static_game_data` blobs the page was handed and who I am. No reads and no
 * subscription: the page re-reads `game_data` on every move, and this is a
 * pure function of the two (plans/seat-view.md → The page is written, not
 * assembled).
 *
 * A game whose builder has not written a blob yet cannot be drawn; the throw
 * lands in `PlayAreaErrorBoundary`'s card.
 */
export function useGame(ctx: PlayAreaLoaderProps): { gd: GGameData } {
  if (ctx.gameData === null) {
    throw new Error('no game_data; run wordsy._rebuild_data_cols_for_all()')
  }
  const myId = ctx.auth.user.id
  // Rebuilt when the page hands down a new blob, and not on every render.
  const gd = useMemo(
    () => makeGameData(mergeStaticGameData(ctx.gameData, ctx.staticGameData), myId),
    [ctx.gameData, ctx.staticGameData, myId],
  )
  return { gd }
}
