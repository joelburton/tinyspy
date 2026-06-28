import type { TimerMode } from '../../common/lib/games'

/**
 * psychicnum's per-game setup — the choices collected by the
 * start-game dialog, persisted to `psychicnum.games.setup`, and
 * validated server-side in `psychicnum.create_game` (the
 * canonical authority for what shapes are accepted).
 *
 * The literal-union on `guesses` mirrors the SQL check; the
 * TypeScript narrowing here is advisory (a curious client could
 * always send something else). The server rejects anything that
 * doesn't match — see the migration's validation block.
 *
 * Lives in `lib/` rather than inline in `manifest.ts` so the
 * Setup body component can import the same type without dragging
 * the manifest in (which would defeat the lazy-load — the form
 * would not split into its own chunk).
 */
export type PsychicnumSetup = {
  /**
   * Starting guess budget — the shared pool every club member
   * draws from. 7 is the historical default; 3/5/9 are the
   * harder/easier alternatives the dialog offers.
   */
  guesses: 3 | 5 | 7 | 9
  /**
   * Highest number on the board: the board shows 1..max_number and
   * the secret is somewhere in that range. 5..20 — a bigger range
   * means more number tiles and a harder guess. Validated
   * server-side by `psychicnum.create_game`.
   */
  max_number: number
  /**
   * Browser-side timer mode. `none` and `countup` are
   * informational; `countdown` flips the game to `lost` when the
   * clock hits 0 (via psychicnum.submit_timeout). Validated
   * server-side by `common.validate_timer`.
   */
  timer: TimerMode
}

/**
 * Initial setup the manifest hands the SetupGameDialog wrapper
 * as `defaults`. Guesses=7 keeps parity with the previous
 * hardcoded value; the timer defaults to a count-down — a
 * "casual game with stakes" baseline that players can dial up or
 * down (or turn off entirely) before starting.
 */
export const DEFAULT_PSYCHICNUM_SETUP: PsychicnumSetup = {
  guesses: 7,
  max_number: 10,
  timer: { kind: 'countdown', seconds: 15 },
}

/** The allowed `guesses` values — drives the radio rendering. */
export const GUESS_OPTIONS = [3, 5, 7, 9] as const

/** Inclusive bounds for the board's highest number (the setup picker range). */
export const MAX_NUMBER_MIN = 5
export const MAX_NUMBER_MAX = 20

/** The selectable highest-number values, `MAX_NUMBER_MIN`..`MAX_NUMBER_MAX`. */
export const MAX_NUMBER_OPTIONS = Array.from(
  { length: MAX_NUMBER_MAX - MAX_NUMBER_MIN + 1 },
  (_, i) => MAX_NUMBER_MIN + i,
)
