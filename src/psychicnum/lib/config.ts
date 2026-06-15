/**
 * Psychic Num's per-game setup config — collected by the
 * start-game dialog, persisted to `psychicnum.games.config`, and
 * validated server-side in `psychicnum.create_game` (the canonical
 * authority for what shapes are accepted).
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
export type PsychicnumConfig = {
  /**
   * Starting guess budget — the shared pool every club member
   * draws from. 7 is the historical default; 3/5/9 are the
   * harder/easier alternatives the dialog offers.
   */
  guesses: 3 | 5 | 7 | 9
}

/**
 * Initial config the manifest hands the SetupGameDialog wrapper
 * as `defaults`. 7 keeps parity with the previous hardcoded
 * value, so the no-op "click Start, accept defaults" path
 * produces the same game shape it always did.
 */
export const DEFAULT_PSYCHICNUM_CONFIG: PsychicnumConfig = {
  guesses: 7,
}

/** The allowed `guesses` values — drives the radio rendering. */
export const GUESS_OPTIONS = [3, 5, 7, 9] as const
