// cs-blessed-psychicnum

import { useMemo } from 'react'
import type { PlayAreaLoaderProps } from '@/common/game-page/playAreaLoaderProps'
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

  // The players first, boards empty, so a board's `decidedBy` can point at
  // them; then each board, from the blob's ids.
  const players: GPlayer[] = raw.players.map((p) => ({ ...p, board: null }))
  const playersById = Object.fromEntries(players.map((p) => [p.id, p]))
  for (const [i, p] of raw.players.entries()) {
    if (!seeRival && !isMine(p.id)) continue
    players[i]!.board = {
      tileResults: new Map(Object.entries(p.board.tileResults)),
      // Every guess is a seated player's: a player's rows go with their
      // profile (`on delete cascade`), so the lookup cannot miss.
      decidedBy: new Map(Object.entries(p.board.decidedBy).map(([word, id]) =>
        [word, playersById[id]!])),
    }
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
    turns: turns === null ? null : { holder: playerOf(turns.holder) },
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
      foundSecretsCount: teamOrMe.foundSecretsCount,
      requiredSecretsCount: me.requiredSecretsCount,
      guessesUsed: teamOrMe.guessesUsed,
      maxGuesses: me.maxGuesses,
    },
  }
}

/**
 * Per-gametype data hook for psychicnum (both modes share it): `gd`, built
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
    throw new Error(`psychicnum: game ${ctx.cg.id} has no game_data; run psychicnum._rebuild_data_cols_for_all()`)
  }
  const myId = ctx.auth.user.id
  // Rebuilt when the page hands down a new blob, and not on every render.
  const gd = useMemo(() => makeGameData(raw, myId), [raw, myId])
  return { gd }
}
