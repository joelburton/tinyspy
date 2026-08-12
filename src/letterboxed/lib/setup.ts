import type { TimerMode } from '../../common/lib/games'
import type { CoopTurnSetup } from '../../common/components/fields/CoopStyleField'
import { parseSides } from './customBoard'

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
 *
 * Plus `custom_sides` — an OPTIONAL player-chosen board (see below).
 */
export type LetterboxedSetup = CoopTurnSetup & {
  timer: TimerMode
  /** Words allowed ABOVE par, 0..5. The cap is `PAR + extra_words`. */
  extra_words: number
  /** Dictionary band a word must be in to count, 1..6. Higher = EASIER. */
  legal_band: number
  /**
   * An OPTIONAL player-chosen board: twelve distinct letters, stored
   * normalised (lowercase, no separators — `cleanSides`) in the same
   * clockwise-from-top-left order `letterboxed.games.sides` uses. Blank/absent
   * means the usual random board — the edge function samples a seed as it
   * always has. Set it and the builder plays exactly this board, which is how
   * you send a friend one you liked.
   *
   * WHAT MAKES THIS DIFFERENT FROM THE OTHER GAMES' CUSTOM BOARDS: a
   * letterboxed board has to be KNOWN SOLVABLE IN TWO, and twelve arbitrary
   * letters almost never are. So the builder does not take your word for it —
   * it looks the twelve letters up in `letterboxed.seeds` (whose primary key
   * IS the sorted twelve) to recover the chained pair that solves them, and
   * checks that pair is still playable under the sides you typed. A board that
   * came out of this game is in that table BY CONSTRUCTION, so the re-share
   * case never fails; a mistyped one is rejected at Start.
   *
   * That lookup is also why nothing downstream is special-cased: `solution`
   * gets a real pair, so par stays 2, the reveal works, and the PDF prints
   * "Solvable in two" exactly as it does for a rolled board.
   *
   * Only the SHAPE is checked here (`customSidesError`); whether the letters
   * are a board we can prove is a seed-table question the frontend can't
   * answer without a round trip, so the edge function owns it — the same
   * division wordiply's `customBaseError` makes.
   *
   * Not saved as the club's next default: `create_game` strips it before
   * handing the setup to `common.create_game`. A one-off, not a baseline —
   * otherwise every later Start would silently rebuild this same board.
   */
  custom_sides?: string
}

/**
 * Why the optional custom board is invalid, or `null` if it's fine (including
 * the common "left blank" case → a random board). `parseSides` owns the
 * reading; the edge function calls the same function server-side, so this is
 * the fail-fast rather than the authority.
 */
export function customSidesError(setup: LetterboxedSetup): string | null {
  const typed = setup.custom_sides ?? ''
  if (!typed) return null // blank → a random board
  const parsed = parseSides(typed)
  return parsed.ok ? null : parsed.error
}

/**
 * The single Start-gate validator for both manifests. Returns the error string
 * (which the dialog shows while disabling Start) or `null` when the setup is
 * valid. `create_game` re-checks server-side.
 */
export function letterboxedSetupError(setup: LetterboxedSetup): string | null {
  if (setup.extra_words < 0 || setup.extra_words > 5) {
    return 'Spare words must be between 0 and 5.'
  }
  if (setup.legal_band < 1 || setup.legal_band > 6) {
    return 'Dictionary must be between 1 and 6.'
  }
  return customSidesError(setup)
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
