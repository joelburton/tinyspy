// cs-unmet

import { useMemo } from 'react'
import { makeEnding } from '@/common/game-page/makeEnding'
import type {
  PlayAreaLoaderProps,
} from '@/common/game-page/playAreaLoaderProps'
import { joinSides } from '../lib/board'
import { findOthersAtTheEnd, makeEndingLabel } from '../lib/endingLabel'
import { makeSetupRows } from '../lib/setupRows'
import type { GEvent, GFacts, GGameData, GGameDataRaw, GPlayer, GWord } from '../types'

/**
 * The seat rule: what a racer may not see yet. Mid-race in compete, a rival's
 * words are their strategy, so their rows leave the log and their chain is
 * null; how many words they have played and how much of the board they have
 * covered stay, the two numbers a race publishes. The game's end opens
 * everything. Coop withholds nothing: one chain, one team.
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
  // under `own`, their own. A coop chain is the team's alone, so it is every
  // player's own too, the same object on each; a racer's is theirs alone to see
  // mid-race. A racer always carries their chain and its counts.
  const gameFacts = { mode: raw.mode, ended: raw.ended, reason: ending?.reason ?? null }
  // Every player's ranking and counts, for the ending labels' ranking words.
  const rankedCounts = raw.players.map((p) => ({
    id: p.id,
    name: p.username,
    finalRanking: p.finalRanking,
    nCoveredLetters: team?.nCoveredLetters ?? p.nCoveredLetters!,
    nWordsUsed: team?.nWordsUsed ?? p.nWordsUsed!,
  }))
  const players: GPlayer[] = raw.players.map(function makePlayer(p, i) {
    const chain = team ?? { nWordsUsed: p.nWordsUsed!, nCoveredLetters: p.nCoveredLetters!, board: p.board! }
    const endingLabel = makeEndingLabel(
      { ...p, ...rankedCounts[i]! },
      gameFacts,
      findOthersAtTheEnd(p, rankedCounts),
    )
    const board = team !== null || seeRival || isMine(p.id) ? chain.board : null
    const own: GFacts = {
      nWordsUsed: chain.nWordsUsed,
      nCoveredLetters: chain.nCoveredLetters,
      maxWords: p.maxWords,
      nHintsUsed: p.nHintsUsed,
      nSpoilersUsed: p.nSpoilersUsed,
      board,
    }
    return { ...p, ...(team ?? own), board, own, endingLabel }
  })
  const playersById = Object.fromEntries(players.map((p) => [p.id, p]))

  // Every row is a seated player's: a player's rows go with their profile
  // (`on delete cascade`), so the lookup cannot miss.
  const events: GEvent[] = raw.events
    .filter((e) => seeRival || isMine(e.userId))
    .map(({ userId, ...row }) => ({ ...row, by: playersById[userId]! }))

  // The blob names the few words a hint may not offer; every word carries
  // its own flag here.
  const uncleanWords = new Set(raw.puzzle.uncleanWords)
  const words: GWord[] = raw.puzzle.words.map((word) => ({ word, clean: !uncleanWords.has(word) }))

  // The gate has checked that I am seated, and my own chain is never withheld.
  const me = playersById[myId] as GGameData['me']

  return {
    ...rest,
    puzzle: {
      tiles: raw.puzzle.tiles,
      tilesById: Object.fromEntries(raw.puzzle.tiles.map((t) => [t.id, t])),
      words,
      nParWords: raw.puzzle.nParWords,
      solution: raw.puzzle.solution,
    },
    setupRows: makeSetupRows(raw.setup, raw.mode, players, joinSides(raw.puzzle.tiles)),
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
 * place: `static_game_data` holds what create fixed, `game_data` the rest. The
 * puzzle is split across both — the board is static, the seeded pair arrives in
 * `game_data` once the game has ended.
 */
function mergeStaticGameData(gameData: unknown, staticGameData: unknown): GGameDataRaw {
  // Each blob holds some of GGameDataRaw's keys; typed whole for the spread.
  const changing = gameData as GGameDataRaw
  const fixed = staticGameData as GGameDataRaw
  return { ...changing, ...fixed, puzzle: { ...fixed.puzzle, ...changing.puzzle } }
}

/**
 * Per-gametype data hook for letterboxed (both modes share it): `gd`, built
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
    throw new Error(
      `letterboxed: game ${ctx.cg.id} has no game_data; run letterboxed._rebuild_data_cols_for_all()`)
  }
  const myId = ctx.auth.user.id
  // Rebuilt when the page hands down a new blob, and not on every render.
  const gd = useMemo(
    () => makeGameData(mergeStaticGameData(ctx.gameData, ctx.staticGameData), myId),
    [ctx.gameData, ctx.staticGameData, myId],
  )
  return { gd }
}
