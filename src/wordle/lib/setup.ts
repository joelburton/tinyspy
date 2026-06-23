import type { TimerMode } from '../../common/lib/games'

/**
 * WordNerd's per-game setup — collected by the start-game dialog,
 * persisted to `common.games.setup`, and validated server-side by
 * `wordle.create_game` (the authority for what's accepted).
 *
 * Lives in `lib/` rather than `manifest.ts` so the SetupForm body can
 * import the type without dragging the manifest into its lazy chunk.
 */
export type WordleSetup = {
  /**
   * Guess budget — how many guesses the player (coop: the team) gets.
   * Classic Wordle is 6; we offer 5–8. The server bounds it.
   */
  max_guesses: number
  /**
   * Timer mode. `none` / `countup` are purely informational; a
   * `countdown` ends the game when it expires, via the shared
   * `wordle.submit_timeout` RPC.
   */
  timer: TimerMode
}

/** Initial setup the manifest hands the dialog as `defaults`. */
export const DEFAULT_WORDLE_SETUP: WordleSetup = {
  max_guesses: 6,
  timer: { kind: 'none' },
}

/** The guess-budget choices the form offers (5–8; 6 is classic). */
export const GUESS_OPTIONS: ReadonlyArray<number> = [5, 6, 7, 8]
