import type { TimerMode } from '../../common/lib/games'
import type { CoopTurnSetup } from '../../common/components/fields/CoopStyleField'

/**
 * letterboxed's per-game setup — collected by the start-game dialog, persisted
 * to `common.games.setup`, validated server-side in `letterboxed.create_game`.
 *
 * **Mode is NOT on this type** — it's locked at the gametype level (the
 * sibling-manifest pattern), not a setup-time choice.
 *
 * Two knobs, and the difference between them is worth reading twice:
 *
 *   - `extra_words` — how many words ABOVE PAR you allow yourself. Every board
 *     is solvable in two, so par is 2 and the cap is `2 + extra_words`. This
 *     is the knob players can actually reason about: "solve it in 5" means
 *     nothing on its own, while "par is 2, you get 3 spare" says exactly how
 *     much room there is. Lower = harder.
 *   - `legal_band` — the dictionary band a word must be in to be ACCEPTED.
 *     NOTE THE DIRECTION: a HIGHER band makes the game EASIER, because more
 *     legal words means more escape routes off an awkward tail letter. (Median
 *     playable words per board runs ~280 at band 1 to ~850 at band 5.) That is
 *     the same inversion strands' band has.
 */
export type LetterboxedSetup = CoopTurnSetup & {
  timer: TimerMode
  /** Words allowed ABOVE par, 0..4. The cap is `PAR + extra_words`. */
  extra_words: number
  /** Dictionary band a word must be in to count, 1..6. Higher = EASIER. */
  legal_band: number
}

/**
 * The single Start-gate validator for both manifests. Returns the error string
 * (which the dialog shows while disabling Start) or `null` when the setup is
 * valid. `create_game` re-checks server-side.
 */
export function letterboxedSetupError(setup: LetterboxedSetup): string | null {
  if (setup.extra_words < 0 || setup.extra_words > 4) {
    return 'Spare words must be between 0 and 4.'
  }
  if (setup.legal_band < 1 || setup.legal_band > 6) {
    return 'Dictionary must be between 1 and 6.'
  }
  return null
}

/**
 * Initial setup for the coop manifest. Three spare words (a cap of five) is
 * roomy — the board is always solvable in two, so it leaves plenty of scenic
 * routes — and band 5 is the generous "legal" band the sibling word games use.
 */
export const DEFAULT_LETTERBOXED_SETUP_COOP: LetterboxedSetup = {
  timer: { kind: 'none' },
  extra_words: 3,
  legal_band: 5,
  // Coop pacing: free-for-all by default; the "Co-op" setup section (coop, 2+
  // players) offers turn-by-turn — which suits this game unusually well, since
  // the chain hands off naturally ("I ended on T, you start on T").
  coop_style: 'free-for-all',
}

/** Initial setup for the compete manifest — identical knobs, no coop pacing. */
export const DEFAULT_LETTERBOXED_SETUP_COMPETE: LetterboxedSetup = {
  timer: { kind: 'none' },
  extra_words: 3,
  legal_band: 5,
}
