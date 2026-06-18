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
export type PsychicNumSetup = {
  /**
   * Starting guess budget — the shared pool every club member
   * draws from. 7 is the historical default; 3/5/9 are the
   * harder/easier alternatives the dialog offers.
   */
  guesses: 3 | 5 | 7 | 9
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
 * hardcoded value; timer defaults to a 10-minute count-down —
 * a sensible "casual game with stakes" baseline that players can
 * dial up or down (or turn off entirely) before starting.
 */
export const DEFAULT_PSYCHICNUM_SETUP: PsychicNumSetup = {
  guesses: 7,
  timer: { kind: 'countdown', seconds: 600 },
}

/** The allowed `guesses` values — drives the radio rendering. */
export const GUESS_OPTIONS = [3, 5, 7, 9] as const
