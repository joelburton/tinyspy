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
 *   - `max_words` — the CHAIN-LENGTH CAP: cover all twelve letters in at most
 *     this many words. It is a plain choice, not a derived "par + slack": every
 *     board the builder can produce has par exactly 2, so there is nothing to
 *     derive. Lower = harder.
 *   - `legal_band` — the dictionary band a word must be in to be ACCEPTED.
 *     NOTE THE DIRECTION: a HIGHER band makes the game EASIER, because more
 *     legal words means more escape routes off an awkward tail letter. (Median
 *     playable words per board runs ~280 at band 1 to ~850 at band 5.) That is
 *     the same inversion strands' band has.
 */
export type LetterboxedSetup = CoopTurnSetup & {
  timer: TimerMode
  /** Chain-length cap, 2..6. Lower = harder. */
  max_words: number
  /** Dictionary band a word must be in to count, 1..6. Higher = EASIER. */
  legal_band: number
}

/**
 * The single Start-gate validator for both manifests. Returns the error string
 * (which the dialog shows while disabling Start) or `null` when the setup is
 * valid. `create_game` re-checks server-side.
 */
export function letterboxedSetupError(setup: LetterboxedSetup): string | null {
  if (setup.max_words < 2 || setup.max_words > 6) {
    return 'The word limit must be between 2 and 6.'
  }
  if (setup.legal_band < 1 || setup.legal_band > 6) {
    return 'Dictionary must be between 1 and 6.'
  }
  return null
}

/**
 * Initial setup for the coop manifest. Five words is roomy — the board is
 * always solvable in two, so five leaves plenty of scenic routes — and band 5
 * is the generous "legal" band the sibling word games use.
 */
export const DEFAULT_LETTERBOXED_SETUP_COOP: LetterboxedSetup = {
  timer: { kind: 'none' },
  max_words: 5,
  legal_band: 5,
  // Coop pacing: free-for-all by default; the "Co-op" setup section (coop, 2+
  // players) offers turn-by-turn — which suits this game unusually well, since
  // the chain hands off naturally ("I ended on T, you start on T").
  coop_style: 'free-for-all',
}

/** Initial setup for the compete manifest — identical knobs, no coop pacing. */
export const DEFAULT_LETTERBOXED_SETUP_COMPETE: LetterboxedSetup = {
  timer: { kind: 'none' },
  max_words: 5,
  legal_band: 5,
}
