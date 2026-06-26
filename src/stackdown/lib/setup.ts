import type { TimerMode } from '../../common/lib/games'

/**
 * stackdown's per-game setup — collected by the start-game dialog,
 * persisted to `common.games.setup`, and validated server-side by
 * `stackdown.create_game` (the authority for what's accepted).
 *
 * Today the only knob is the timer: the board itself is claimed at
 * random from the pre-generated library and its difficulty (`wordlist`)
 * rides along on the board, so there's nothing to pick there yet. A
 * future difficulty selector would add a field here (and a matching
 * board filter in `create_game`).
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
}

/** Initial setup the manifest hands the dialog as `defaults`. */
export const DEFAULT_STACKDOWN_SETUP: StackdownSetup = {
  timer: { kind: 'none' },
}
