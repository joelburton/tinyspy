import type { TimerMode } from '../../common/lib/games'
import type { CoopTurnSetup } from '../../common/components/fields/CoopStyleField'

/**
 * strands' per-game setup — collected by the start-game dialog, persisted to
 * `common.games.setup`, and validated server-side by `strands.create_game`
 * (the authority for what is accepted).
 *
 * Lives in `lib/` rather than `manifest.ts` so the SetupForm body can import the
 * type without dragging the manifest into its lazy chunk.
 */
export type StrandsSetup = CoopTurnSetup & {
  /** Which archived puzzle to play — the date picker resolves a date to this id. */
  puzzleId: string
  /**
   * Dictionary ceiling for HINT words (1..6).
   *
   * **Note the direction: a HIGHER band makes strands EASIER.** More words
   * qualify, so hints come faster. That is the same direction as spellingbee's
   * `legal` band and the OPPOSITE of waffle's tier, where a higher band means a
   * harder board — which is exactly the sort of thing a setup form gets
   * backwards, so the field's copy says so out loud.
   *
   * Gated on difficulty ALONE (the may-enter tier in docs/common.md): a word
   * the player chose to type is unrestricted by slur / crude / slang / dialect.
   */
  band: number
  /** Valid non-theme words needed per hint. NYT plays 3. */
  hint_cost: number
  /**
   * Shortest word that can earn a hint point.
   *
   * Does NOT gate theme words: those are matched first and unconditionally, so
   * raising this never makes a real answer unfindable. (33 of 148 sampled theme
   * words are exactly 4 letters, so a length-first check would break most
   * puzzles at 5.)
   */
  min_word_length: number
  /** `countdown` ends the game via `strands.submit_timeout`; the clock is a LOSS. */
  timer: TimerMode
}

/** Band 5 matches the other word games' "legal" default: generous enough that
 *  hints are earnable without handing them out. */
export const DEFAULT_STRANDS_SETUP_COOP: StrandsSetup = {
  puzzleId: '',
  band: 5,
  hint_cost: 3,
  min_word_length: 4,
  timer: { kind: 'none' },
  coop_style: 'free-for-all',
}

/**
 * The Start-gate validator. Only the puzzle pick can be genuinely missing — the
 * numeric knobs come from bounded controls, and the server re-checks every one
 * of them regardless.
 */
export function strandsSetupError(setup: StrandsSetup): string | null {
  if (!setup.puzzleId) return 'Pick a puzzle date to play.'
  return null
}

/** Compete's defaults. Identical to coop's but for the pacing field, which is
 *  meaningless in a race — everyone plays at once, always. */
export const DEFAULT_STRANDS_SETUP_COMPETE: StrandsSetup = {
  ...DEFAULT_STRANDS_SETUP_COOP,
  coop_style: 'free-for-all',
}
