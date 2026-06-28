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
   * How many words sit on the board (5..20). Three of them are the
   * hidden secrets; a bigger board means more haystack around the
   * three needles. Validated server-side by `psychicnum.create_game`.
   */
  word_count: number
  /**
   * Dictionary difficulty band (1..6 = Universal..Expert), a
   * `common.words.difficulty` value. The board words are sampled from
   * the dictionary at `difficulty ≤ this` (plus a clean + american +
   * non-slang filter). Validated server-side.
   */
  difficulty: number
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
 * as `defaults`. A 10-word board at the Familiar band (3) is a
 * gentle baseline; the timer defaults to a count-down — a "casual
 * game with stakes" the players can dial up or down (or off).
 */
export const DEFAULT_PSYCHICNUM_SETUP: PsychicnumSetup = {
  guesses: 7,
  word_count: 10,
  difficulty: 3,
  timer: { kind: 'countdown', seconds: 15 },
}

/** The allowed `guesses` values — drives the radio rendering. */
export const GUESS_OPTIONS = [3, 5, 7, 9] as const

/** Inclusive bounds for the board's word count (the setup picker range). */
export const WORD_COUNT_MIN = 5
export const WORD_COUNT_MAX = 20

/** The selectable board-size values, `WORD_COUNT_MIN`..`WORD_COUNT_MAX`. */
export const WORD_COUNT_OPTIONS = Array.from(
  { length: WORD_COUNT_MAX - WORD_COUNT_MIN + 1 },
  (_, i) => WORD_COUNT_MIN + i,
)
