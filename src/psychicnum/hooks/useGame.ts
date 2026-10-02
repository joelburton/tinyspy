// cs-blessed-psychicnum

/*
 * What this hook returns: `gd`, the playarea blob with its links turned into
 * players and the seat rule applied (plans/seat-view.md).
 *
 * gd:
 *   id
 *   gametype
 *   brand
 *   club: {handle}
 *   mode
 *   coop
 *   compete
 *   oneBoard
 *   title
 *   setup
 *   setupRows
 *   puzzle: {words, secrets}              # secrets null until the game ends
 *   turns: {holder}                       # null: no turn order; holder null: nobody's turn now
 *   ending: {reason, detail, by, winner}  # null while playing; by and winner are players
 *   ended
 *   outcome                               # null until the game ends
 *   events: [{id, by, word, correct, kind, at}, …]   # the log, by a player; my rows only, mid-race
 *   players: [player, …]                  # seat order
 *   playersById
 *   me                                    # same object as playersById[auth.user.id]
 *
 * player:
 *   id
 *   username
 *   color
 *   ai
 *   seat                                  # null in a free-for-all game
 *   ending: {at, reason, detail}          # null unless they ended before the game ended
 *   outcome                               # null until written
 *   finalRanking                          # null until written
 *   solvedAt
 *   conceded
 *   solved
 *   stillPlaying
 *   onTurn
 *   waitingForTurn
 *   requiredSecretsCount                  # the same on every player
 *   maxGuesses                            # the same on every player
 *   foundSecretsCount                     # own in compete; the team's, on every player, in coop
 *   guessesUsed                           # own in compete; the team's, on every player, in coop
 *   board: {tileResults, decidedBy}       # what this seat's tiles show; null for a rival mid-race
 */

import { useMemo } from 'react'
import type { PlayAreaLoaderProps } from '@/common/game-page/playAreaLoaderProps'
import type { SetupRow } from '@/common/setup-form/setupRows'
import type { PsychicnumPlayarea, PsychicnumPlayareaEvent, PsychicnumPlayareaPlayer } from '../lib/playarea'
import { makeSetupRows } from '../lib/setupRows'
import type { TileResults, TileWord } from '../lib/tileResults'

/** What one seat's tiles show. */
export type PsychicnumBoard = {
  // Each guessed word → whether it was a secret: the board's permanent green
  // and red. Hint and spoiler rows mark no tile.
  tileResults: TileResults
  // Each guessed word → who guessed it.
  decidedBy: ReadonlyMap<TileWord, PsychicnumPlayer>
}

/** One row of the log, as `gd` holds it: the blob's row, with its player. */
export type PsychicnumEvent = Omit<PsychicnumPlayareaEvent, 'userId'> & {
  // Who guessed, asked, or was handed the spoiler.
  by: PsychicnumPlayer
}

/** One player of this game, as `gd` holds them: the blob's player, with the
 *  board's ids turned into players — or null, for a rival mid-race. */
export type PsychicnumPlayer = Omit<PsychicnumPlayareaPlayer, 'board'> & {
  board: PsychicnumBoard | null
}

/**
 * **`gd`, the game data** — everything the play surface knows about THIS
 * game, in one object. It is the playarea blob the game's builder wrote
 * (`PsychicnumPlayarea`), with its links turned into players, the setup rows
 * built, and the seat rule applied: what I may not see yet is not here.
 * Read-only: `useGame` builds it and nothing else writes it.
 */
export type GameData = Omit<PsychicnumPlayarea, 'turns' | 'ending' | 'events' | 'players'> & {
  // The setup's choices as rows, built ONCE for both readers — the info column
  // renders them as <li>s, the printout prints the same array
  // (common/setup-form/doc.md → Setup rows).
  setupRows: SetupRow[]
  turns: { holder: PsychicnumPlayer | null } | null
  // The log, by player; mid-race in compete, my rows only.
  events: PsychicnumEvent[]
  ending: {
    reason: NonNullable<PsychicnumPlayarea['ending']>['reason']
    detail: string
    by: PsychicnumPlayer | null
    winner: PsychicnumPlayer | null
  } | null
  // The players in seat order, and the same objects keyed by id.
  players: PsychicnumPlayer[]
  playersById: Record<string, PsychicnumPlayer>
  // My entry in `playersById`: the same object. My own board is always mine
  // to see.
  me: PsychicnumPlayer & { board: PsychicnumBoard }
}

/**
 * The seat rule: what a racer may not see yet. Mid-race in compete, a rival's
 * guesses are their strategy, so their rows leave the log and their board is
 * null; the game's end opens everything. Coop withholds nothing: one board,
 * one team.
 */
function maySeeRival(playarea: PsychicnumPlayarea): boolean {
  return playarea.coop || playarea.ended
}

/**
 * Build `gd` from the blob and who I am. Pure, so a test hands it a blob and
 * reads what the surface would.
 */
export function makeGameData(playarea: PsychicnumPlayarea, myId: string): GameData {
  const seeRival = maySeeRival(playarea)
  const isMine = (id: string) => id === myId

  // The players first, boards empty, so a board's `decidedBy` can point at
  // them; then each board, from the blob's ids.
  const players: PsychicnumPlayer[] = playarea.players.map((p) => ({ ...p, board: null }))
  const playersById = Object.fromEntries(players.map((p) => [p.id, p]))
  for (const [i, p] of playarea.players.entries()) {
    if (!seeRival && !isMine(p.id)) continue
    players[i]!.board = {
      tileResults: new Map(Object.entries(p.board.tileResults)),
      // Every guess is a seated player's: a player's rows go with their
      // profile (`on delete cascade`), so the lookup cannot miss.
      decidedBy: new Map(Object.entries(p.board.decidedBy).map(([word, id]) => [word, playersById[id]!])),
    }
  }

  // Links that cannot miss get a bare lookup; an ending's `by` may be null for
  // a timeout.
  const playerOf = (id: string | null) => (id === null ? null : playersById[id]!)

  const events: PsychicnumEvent[] = playarea.events
    .filter((e) => seeRival || isMine(e.userId))
    .map(({ userId, ...row }) => ({ ...row, by: playersById[userId]! }))

  const { turns, ending, ...rest } = playarea
  return {
    ...rest,
    setupRows: makeSetupRows(playarea.setup, playarea.mode, players),
    turns: turns === null ? null : { holder: playerOf(turns.holder) },
    ending: ending === null
      ? null
      : { reason: ending.reason, detail: ending.detail, by: playerOf(ending.by), winner: playerOf(ending.winner) },
    events,
    players,
    playersById,
    // The gate has checked that I am seated, and my own board is never withheld.
    me: playersById[myId] as GameData['me'],
  }
}

/**
 * Per-gametype data hook for psychicnum (both modes share it): `gd`, built
 * from the playarea blob the page was handed and who I am. No reads and no
 * subscription: the page re-reads the blob on every move, and this is a pure
 * function of it (plans/seat-view.md → The page is written, not assembled).
 *
 * A game whose builder has not written a blob yet cannot be drawn; the throw
 * lands in `PlayAreaErrorBoundary`'s card.
 *
 * The cross-cutting machinery (presence, manual-pause, timer) lives on
 * `useCommonGame` inside `GamePage` — see `src/common/game-page/useCommonGame.ts`.
 */
export function useGame(ctx: PlayAreaLoaderProps): { gd: GameData } {
  const playarea = ctx.playarea as PsychicnumPlayarea | null
  if (playarea === null) {
    throw new Error(`psychicnum: game ${ctx.cg.id} has no playarea blob; run psychicnum._rebuild_pages()`)
  }
  const myId = ctx.auth.user.id
  // Rebuilt when the page hands down a new blob, and not on every render.
  const gd = useMemo(() => makeGameData(playarea, myId), [playarea, myId])
  return { gd }
}
