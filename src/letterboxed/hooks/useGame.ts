// cs-unmet

import { useMemo } from 'react'
import type {
  PlayAreaLoaderProps,
} from '@/common/game-page/playAreaLoaderProps'
import { joinSides } from '../lib/board'
import { makeSetupRows } from '../lib/setupRows'
import type { GEvent, GGameData, GGameDataRaw, GPlayer, GStateLineData, GWord } from '../types'

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

  const players: GPlayer[] = raw.players.map((p) => ({
    ...p,
    board: seeRival || isMine(p.id) ? p.board : null,
  }))
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
    .map(({ userId, ...row }) => ({ ...row, by: playersById[userId]! }))

  // The blob names the few words a hint may not offer; every word carries
  // its own flag here.
  const uncleanWords = new Set(raw.puzzle.uncleanWords)
  const words: GWord[] = raw.puzzle.words.map((word) => ({ word, clean: !uncleanWords.has(word) }))

  // The gate has checked that I am seated, and my own chain is never withheld.
  const me = playersById[myId] as GGameData['me']
  // What the state line shows: the team's chain where the game has one, else
  // my own (plans/team-facts.md). A racer always carries their two counts.
  const stateLineData: GStateLineData = {
    nCoveredLetters: raw.team?.nCoveredLetters ?? me.nCoveredLetters!,
    nWordsUsed: raw.team?.nWordsUsed ?? me.nWordsUsed!,
    maxWords: me.maxWords,
    nParWords: raw.puzzle.nParWords,
  }

  const { turns, ending, ...rest } = raw
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
 * Per-gametype data hook for letterboxed (both modes share it): `gd`, built
 * from the `game_data` blob the page was handed and who I am. No reads and no
 * subscription: the page re-reads the blob on every move, and this is a pure
 * function of it (plans/seat-view.md → The page is written, not assembled).
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
      `letterboxed: game ${ctx.cg.id} has no game_data; run letterboxed._rebuild_data_cols_for_all()`)
  }
  const myId = ctx.auth.user.id
  // Rebuilt when the page hands down a new blob, and not on every render.
  const gd = useMemo(() => makeGameData(raw, myId), [raw, myId])
  return { gd }
}
