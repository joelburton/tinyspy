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
   * Vocabulary tier (1–6) — the recognizability band the six words are
   * drawn from: a tier-N puzzle uses words of band ≤ N with its hardest
   * word at exactly N. The board is generated on demand for the chosen
   * band (the `waffle-build-board` edge function). The dialog offers the
   * full 1–6 via the shared `DifficultyField`.
   */
  difficulty: number
  /**
   * Slack added to the puzzle's par to get the swap budget
   * (`max_swaps = par + extra_swaps`). Fewer extra swaps = harder.
   * Server bounds it to 0..15; the form offers a friendly few.
   */
  extra_swaps: number
  /**
   * Timer mode. `none` / `countup` are purely informational; a
   * `countdown` ends the game when it expires, via the shared
   * `waffle.submit_timeout` RPC.
   */
  timer: TimerMode
}

/** Initial setup the manifest hands the dialog as `defaults`. */
export const DEFAULT_WAFFLE_SETUP: WaffleSetup = {
  difficulty: 2,
  extra_swaps: 5,
  timer: { kind: 'none' },
}

/**
 * The extra-swap choices the form offers, with a difficulty gloss.
 * par is ~9–11, so these land the budget around 12–19.
 */
export const EXTRA_SWAP_OPTIONS: ReadonlyArray<{ value: number; label: string }> = [
  { value: 3, label: 'Tight' },
  { value: 5, label: 'Normal' },
  { value: 8, label: 'Relaxed' },
]
