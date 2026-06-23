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
   * Vocabulary tier — the recognizability band the six words are drawn
   * from: a tier-N puzzle uses words of band ≤ N with its hardest word
   * at exactly N. The server picks a pre-generated puzzle of the chosen
   * tier and accepts the full band range 1–6; the dialog offers a
   * subset (see `DIFFICULTY_OPTIONS`).
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
 * The vocab tiers the form OFFERS — bands 1–5 (band 6, SOWPODS-only
 * "expert", is left off as too obscure for a swap puzzle). This is a
 * pure UI choice: the server accepts the full 1–6 range and the puzzle
 * library has every band, so adding/removing a tier here needs no DB
 * or data change. Labels follow the common.words band names.
 */
export const DIFFICULTY_OPTIONS: ReadonlyArray<{ value: number; label: string }> = [
  { value: 1, label: 'Universal' },
  { value: 2, label: 'Common' },
  { value: 3, label: 'Familiar' },
  { value: 4, label: 'Uncommon' },
  { value: 5, label: 'Obscure' },
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
