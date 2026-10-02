// cs-unmet

import type { CommonPlayarea, CommonPlayareaPlayer } from '@/common/game-page/playarea'
import type { PsychicnumSetup } from './setup'
import type { TileWord } from './tileResults'

/**
 * psychicnum's playarea blob, as `psychicnum._write_statuses` writes it
 * (supabase/sql/psychicnum.sql → The page blobs): the common part, with the
 * puzzle, the log and psychicnum's facts about each player on top. What the
 * page is handed in `PlayAreaLoaderProps.playarea`; `useGame` turns it into
 * `gd`.
 *
 * It carries everything: every player's rows in the log, and every seat's
 * board. What a racer may see of a rival mid-race is `useGame`'s rule.
 */
export type PsychicnumPlayarea = Omit<CommonPlayarea, 'setup' | 'players'> & {
  setup: PsychicnumSetup
  puzzle: {
    // The words shown as tiles; three of them are the secrets.
    words: TileWord[]
    // Null until the game ends.
    secrets: TileWord[] | null
  }
  // The log: guesses, hints and spoilers, in the order of play.
  events: PsychicnumPlayareaEvent[]
  players: PsychicnumPlayareaPlayer[]
}

/** One row of the log, as the blob carries it; `gd` turns `userId` into the
 *  player (`PsychicnumEvent`). */
export type PsychicnumPlayareaEvent = {
  // The row's own id, and the order of play.
  id: number
  userId: string
  // The text this row carries. For 'guess' / 'spoiler' it's a `TileWord`; for
  // 'hint' it's the CLUE text (or "No hint available"), which is why this is
  // a plain string.
  word: string
  correct: boolean
  // 'guess' = a real guess (colors the board, counts toward the win);
  // 'spoiler' = a secret word handed over (the answer);
  // 'hint' = a clue for a secret.
  kind: 'guess' | 'hint' | 'spoiler'
  at: string
}

/** A player as psychicnum's playarea shows them: the common player, with the
 *  budget, the counts and this seat's board. */
export type PsychicnumPlayareaPlayer = CommonPlayareaPlayer & {
  // How many secrets the board hides. The same on every player.
  requiredSecretsCount: number
  // The guess budget: the team's in coop, each player's own in compete. The
  // same on every player.
  maxGuesses: number
  // Own in compete; the team's, on every player, in coop.
  foundSecretsCount: number
  guessesUsed: number
  // What this seat's tiles show: each guessed word → whether it was a secret,
  // and → who guessed it. One board in coop, each racer's own in compete.
  board: {
    tileResults: Record<TileWord, boolean>
    decidedBy: Record<TileWord, string>
  }
}
