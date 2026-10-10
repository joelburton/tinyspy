// cs-unmet

import type { TimerMode } from '../manifest/types'
import type { Member } from '../members/member'
import type { NotOkEnvelope } from '../supabase/envelope'
import { faultEnvelope, OUR_BUG_TO_CODE_AND_TEXT } from '../supabase/dbEnvelope'

/**
 * `common.games.shell_data`, as `common._make_json_shell_data` builds it, the same
 * shape for every gametype (supabase/sql/common.sql → The page blobs' common
 * parts). It is everything `GamePage` shows about a game, and nothing more:
 * the page never sees a seat, an outcome or whose turn it is. Those are
 * `game_data`'s, which is the game's.
 */
export type Shell = {
  id: string
  gametype: string
  club: { handle: string }
  title: string
  // How many times the game has been restarted; the play surface is keyed on
  // it, so a restart mounts a fresh one.
  restartCount: number
  // The game has ended.
  ended: boolean
  // The clock's kind as `common.timers` holds it now: the setup's, unless the
  // game re-arms it mid-game, as FlipWord's round timer does.
  timer: TimerMode
  // Everyone in the game, in seat order.
  players: ShellPlayer[]
}

/** A player as shell_data shows them: who they are, and whether the pause
 *  still waits for them. */
export type ShellPlayer = Member & {
  // This seat is an AI opponent: it never opens a tab.
  ai: boolean
  // The game still wants moves from this player.
  stillPlaying: boolean
}

/**
 * **`cg`, the common game** — the shell_data, plus `me`: the signed-in user's
 * own entry in `players`, the same object. Never null, because you must be seated
 * to open a game and the gate has checked. Read-only: `useCommonGame` builds it
 * and nothing else writes it.
 */
export type CommonGame = Shell & { me: ShellPlayer }

/**
 * The failure a read reports for a game whose shell_data is null: its builder
 * has not written the page, so there is nothing to draw. Named rather than folded
 * into "no such game", because the game is there and saying otherwise would
 * be the confident wrong answer this area exists to stop.
 */
export function noShellEnvelope(gameId: string): NotOkEnvelope {
  return faultEnvelope(
    null,
    OUR_BUG_TO_CODE_AND_TEXT.noShell.text,
    `common.games.shell_data is null for ${gameId}: its status builder has not written it`,
    OUR_BUG_TO_CODE_AND_TEXT.noShell.code,
  )
}
