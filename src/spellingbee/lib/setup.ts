import type { TimerMode } from '../../common/lib/games'

/**
 * spellingbee's per-game setup — collected by the start-game dialog,
 * persisted to `common.games.setup`, validated server-side in
 * `spellingbee.create_game`.
 *
 * **Mode is NOT on this type** — it's locked at the gametype
 * level (the sibling-manifest pattern), not a setup-time choice.
 * Clicking "Start spellingbee (coop)" vs "(compete)" is what picks
 * mode; both manifests share this same setup shape. The
 * `spellingbee.create_game` RPC rejects a `mode` field on setup with
 * a loud P0001 — so a stale FE that still embeds it fails fast
 * rather than silently mismatching.
 *
 * Fields:
 *   - `timer` — wall-clock mode (none / countup / countdown).
 *     Per-game rather than per-gametype so friends can pick
 *     their own challenge each session.
 *   - `target_rank` — REQUIRED when starting from the compete
 *     manifest; absent when starting from the coop manifest.
 *     0..6 maps to the Start..Genius rank ladder. Compete wins
 *     when the first player reaches this rank.
 *   - `required` / `legal` — the vocabulary bands. `required`
 *     (1..6) is where the displayed goal words come from; `legal`
 *     (required..6) is the wider set of accepted/bonus words. The
 *     board pool is selected at the band-1 floor, so any choice is
 *     solvable; `legal` must contain `required` (see
 *     `legalError`).
 *   - `custom_center` + `custom_letters` — an OPTIONAL player-
 *     specified letter set: the center letter + the six other
 *     letters. When both are set (and valid — see
 *     `customLettersError`) the edge function builds a board from
 *     exactly those letters instead of sampling a random pangram
 *     seed; both empty means a random board. Works in either mode.
 *     Because the player chose the letters, a custom board skips
 *     the ≥30-required-words quality gate the random builder
 *     enforces (it only needs ≥1 required word to be playable), and
 *     the letters are NOT saved as the club's next default — a
 *     one-off, not a new baseline.
 */
export type SpellingbeeSetup = {
  timer: TimerMode
  /** Required in compete, absent in coop. Optional on the type
   *  because both manifests share it; the per-mode default
   *  factories below seed the field iff compete. */
  target_rank?: number
  /** Required-words band (1..6); see the type-level notes. */
  required: number
  /** Legal/bonus-words band (required..6). */
  legal: number
  /** Optional custom board: the center letter (1) + the six other letters.
   *  Both set → custom board; both empty/undefined → random. See the type notes
   *  and `customLettersError`. */
  custom_center?: string
  custom_letters?: string
}

/**
 * Why the current `legal` band is too low to start, or `null`: the legal set
 * must contain the required set, so `legal >= required`. The dialog gates Start
 * on this (via the manifest's `validate`); `create_game` re-checks server-side.
 */
export function legalError(setup: SpellingbeeSetup): string | null {
  if (setup.legal < setup.required) {
    return `Legal words must reach at least the required band (${setup.required}).`
  }
  return null
}

/**
 * Why the optional custom-letters override is invalid, or `null` if it's fine
 * (including the common "left blank" case → a random board).
 *
 * Mirrors the letter rules `spellingbee.create_game` enforces server-side, so the
 * dialog fails fast before the round-trip: if EITHER field is filled, BOTH must
 * be, and together they must be exactly one center + six OTHER letters, all seven
 * distinct lowercase a–z, and NONE may be `s` (the Spelling Bee rule — an `s`
 * would make trivial plurals of every word). Case/whitespace are normalized here
 * the same way the SetupForm cleans its inputs.
 */
export function customLettersError(setup: SpellingbeeSetup): string | null {
  const center = (setup.custom_center ?? '').trim().toLowerCase()
  const letters = (setup.custom_letters ?? '').trim().toLowerCase()
  if (!center && !letters) return null // both blank → random board
  if (!center || !letters) {
    // One line: the dialog's validation slot is single-line (nowrap+ellipsis);
    // the section's own copy explains the leave-both-blank-for-random option.
    return 'Enter a center letter AND six other letters, or leave both blank.'
  }
  if (!/^[a-z]$/.test(center)) return 'The center must be a single letter A–Z.'
  if (!/^[a-z]{6}$/.test(letters)) return 'Enter exactly six other letters (A–Z).'
  if (center === 's' || letters.includes('s')) {
    return "Spelling Bee never uses the letter S — pick different letters."
  }
  if (new Set(center + letters).size !== 7) return 'All seven letters must be different.'
  return null
}

/**
 * The single Start-gate validator for both manifests: the legal-band rule OR the
 * custom-letters rule, whichever fails first (the manifest's `validate` shows the
 * returned string and disables Start until it's `null`).
 */
export function spellingbeeSetupError(setup: SpellingbeeSetup): string | null {
  return legalError(setup) ?? customLettersError(setup)
}

/**
 * Initial setup for the coop manifest — no `target_rank` (coop
 * has no win-rank to race to; see the type's field notes). The
 * timer starts off; players pick a clock in the setup dialog.
 */
export const DEFAULT_SPELLINGBEE_SETUP_COOP: SpellingbeeSetup = {
  timer: { kind: 'none' },
  required: 3,
  legal: 5,
}

/**
 * Initial setup for the compete manifest. Adds `target_rank: 5`
 * (Amazing — the second-toughest tier on the 7-rank ladder). The
 * SetupForm surfaces a picker so the choice is changeable per
 * game; the default is the "decisive race without being a slog"
 * pick from the design conversation.
 */
export const DEFAULT_SPELLINGBEE_SETUP_COMPETE: SpellingbeeSetup = {
  timer: { kind: 'none' },
  target_rank: 5,
  required: 3,
  legal: 5,
}
