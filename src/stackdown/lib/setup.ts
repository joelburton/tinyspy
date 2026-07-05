import type { TimerMode } from '../../common/lib/games'

/**
 * stackdown's per-game setup — collected by the start-game dialog,
 * persisted to `common.games.setup`, and validated server-side by
 * `stackdown.create_game` (the authority for what's accepted).
 *
 * Two knobs: the timer, and the word-difficulty `band`. The board is
 * claimed at random from the pre-generated library FILTERED to the chosen
 * band (create_game does the filtering + validation); the board's own
 * `band` then rides along on the game.
 *
 * Lives in `lib/` rather than `manifest.ts` so the SetupForm body can
 * import the type without dragging the manifest into its lazy chunk.
 */
export type StackdownSetup = {
  /**
   * Timer mode. `none` / `countup` are purely informational; a
   * `countdown` ends the game when it expires (coop → everyone loses,
   * compete → no winner), via the shared `stackdown.submit_timeout` RPC.
   */
  timer: TimerMode
  /**
   * Word-difficulty band — a `common.words.difficulty` ceiling. `1` = the
   * common everyday set; `2` mixes in less-common words (a band-2 board is
   * guaranteed at least one difficulty-2 word). The form offers 1..2 today
   * (that's what the board library holds); create_game accepts any 1..6 it
   * has boards for.
   */
  band: number
}

/** Initial setup the manifest hands the dialog as `defaults`. */
export const DEFAULT_STACKDOWN_SETUP: StackdownSetup = {
  timer: { kind: 'none' },
  band: 1,
}
