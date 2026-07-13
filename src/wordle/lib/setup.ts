import type { TimerMode } from '../../common/lib/games'
import type { CoopTurnSetup } from '../../common/components/fields/CoopStyleField'

/**
 * wordle's per-game setup — collected by the start-game dialog,
 * persisted to `common.games.setup`, and validated server-side by
 * `wordle.create_game` (the authority for what's accepted).
 *
 * Lives in `lib/` rather than `manifest.ts` so the SetupForm body can
 * import the type without dragging the manifest into its lazy chunk.
 */
export type WordleSetup = CoopTurnSetup & {
  /**
   * Guess budget — how many guesses the player (coop: the team) gets.
   * Classic Wordle is 6; we offer 5–8. The server bounds it.
   */
  max_guesses: number
  /**
   * Where the hidden target is drawn from. `0` = the curated NYT-Wordle answer
   * list (`wordle=true`, the classic feel — default). `1..6` = any 5-letter
   * word of that difficulty band or easier (a higher band can yield an obscure
   * answer). See `wordle.create_game`.
   */
  answer_source: number
  /**
   * What counts as a legal guess: any real 5-letter word of difficulty ≤ this
   * (1..6). Must reach the answer's hardest band so every possible answer is
   * itself a legal guess — see `legalGuessError` / `answerMaxBand`.
   */
  legal_guess: number
  /**
   * Timer mode. `none` / `countup` are purely informational; a
   * `countdown` ends the game when it expires, via the shared
   * `wordle.submit_timeout` RPC.
   */
  timer: TimerMode
}

/** Initial setup the manifest hands the dialog as `defaults`. Defaults to the
 *  classic game: the NYT answer list (source 0), guesses accepted up to band 4. */
export const DEFAULT_WORDLE_SETUP: WordleSetup = {
  max_guesses: 6,
  answer_source: 0,
  legal_guess: 4,
  timer: { kind: 'none' },
  // Coop pacing: free-for-all by default; the setup dialog's "Co-op"
  // section (coop, 2+ players) offers turn-by-turn. firstTurnUserId is
  // seeded by the field when turns is picked.
  coopStyle: 'free-for-all',
}

/** The guess-budget choices the form offers (5–8; 6 is classic). */
export const GUESS_OPTIONS: ReadonlyArray<number> = [5, 6, 7, 8]

/**
 * The hardest band a possible answer can be, given the source. The curated
 * Wordle list (source 0) tops out at band 2; a difficulty band N tops out at N.
 * (Kept in sync with create_game's server-side check.)
 */
export function answerMaxBand(setup: WordleSetup): number {
  return setup.answer_source === 0 ? 2 : setup.answer_source
}

/**
 * Why the current `legal_guess` band is too low to start, or `null`. A guess
 * must be able to spell any possible answer, so `legal_guess` has to reach the
 * answer's hardest band. The dialog gates Start on this (via the manifest's
 * `validate`); `create_game` re-checks server-side.
 */
export function legalGuessError(setup: WordleSetup): string | null {
  const min = answerMaxBand(setup)
  if (setup.legal_guess < min) {
    return `Legal guesses must reach at least band ${min}, so every possible answer is itself a guessable word.`
  }
  return null
}
