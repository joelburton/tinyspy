import type { TimerMode } from '../../common/lib/games'

/**
 * SyrupSwap's per-game setup — collected by the start-game dialog,
 * persisted to `common.games.setup`, and validated server-side by
 * `waffle.create_game` (the authority for what's accepted).
 *
 * Lives in `lib/` rather than `manifest.ts` so the SetupForm body can
 * import the type without dragging the manifest into its lazy chunk.
 */
export type WaffleSetup = {
  /**
   * Vocabulary tier — which difficulty band the six words are drawn
   * from (35 everyday / 50 common / 60 tricky). While we're trialling
   * tiers the server picks a puzzle whose `title` matches; valid
   * values are 35, 50, 60.
   */
  difficulty: number
  /**
   * Slack added to the puzzle's par to get the swap budget
   * (`max_swaps = par + extra_swaps`). Fewer extra swaps = harder.
   * Server bounds it to 0..15; the form offers a friendly few.
   */
  extra_swaps: number
  /**
   * Browser-side timer. `none` / `countup` are informational; a
   * `countdown` ending the game is a slice-2 feature (needs
   * waffle.submit_timeout), so the default is `none`.
   */
  timer: TimerMode
}

/** Initial setup the manifest hands the dialog as `defaults`. */
export const DEFAULT_WAFFLE_SETUP: WaffleSetup = {
  difficulty: 50,
  extra_swaps: 5,
  timer: { kind: 'none' },
}

/**
 * The vocab tiers the form offers. These match the `Difficulty N`
 * puzzle titles in the library. The difficulty ratings are a bit noisy
 * at the upper tiers (some "common" words are Scrabble-common, not
 * everyday), so the labels stay loose.
 */
export const DIFFICULTY_OPTIONS: ReadonlyArray<{ value: number; label: string }> = [
  { value: 35, label: 'Everyday' },
  { value: 50, label: 'Common' },
  { value: 60, label: 'Tricky' },
]

/**
 * The extra-swap choices the form offers, with a difficulty gloss.
 * par is ~9–11, so these land the budget around 12–19.
 */
export const EXTRA_SWAP_OPTIONS: ReadonlyArray<{ value: number; label: string }> = [
  { value: 3, label: 'Tight' },
  { value: 5, label: 'Normal' },
  { value: 8, label: 'Relaxed' },
]
