// cs-blessed-spellingbee

import type { TimerMode } from '@/common/manifest/gameManifest'
import type { SetupOf } from '@/common/setup-form/setupForm'
import type { FormErrors } from '@/common/forms/formState'

/**
 * spellingbee's per-game setup — collected by the start-game dialog,
 * persisted to `common.games.setup`, validated server-side in
 * `spellingbee.create_game`.
 *
 * **Mode is NOT on this type** — it is the manifest's, picked by which Start
 * button was pressed, and `create_game` takes it as its own argument; both
 * manifests share this one setup shape.
 *
 * Fields:
 *   - `timer` — wall-clock mode (none / countup / countdown).
 *     Per-game rather than per-gametype so friends can pick
 *     their own challenge each session.
 *   - `target_rank` — 0..6 on the Start..Genius rank ladder.
 *     REQUIRED in compete (the race's finish line — first player
 *     there wins). OPTIONAL in coop, where it's the TEAM's win
 *     threshold: reach it together and the game ends as a win.
 *     `undefined` in coop means the open-ended word hunt, which
 *     only the clock or the End button stops — the default, and
 *     the right pick for a group that just wants to find words.
 *   - `required_band` / `legal_band` — the vocabulary bands, each a
 *     dictionary difficulty ceiling. `required_band` (1..6) is where
 *     the displayed goal words come from; `legal_band`
 *     (required_band..6) is the wider set of accepted/bonus words;
 *     it must contain the required band (see `legalError`). Every
 *     random board is grown from a band-1 pangram, but a narrow
 *     `required_band` can still leave no board with 30 required words,
 *     which the edge function refuses under this field.
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
export type SpellingbeeValues = {
  timer: TimerMode
  // Required in compete; optional in coop, where it's the team's win
  // threshold (undefined = no win condition, the coop default).
  target_rank?: number
  // Required-words band (1..6); see the type-level notes.
  required_band: number
  // Legal/bonus-words band (required_band..6).
  legal_band: number
  // Optional custom board: the center letter (1) + the six other letters.
  // Both set → custom board; both empty/undefined → random. See the type notes
  // and `customLettersError`.
  custom_center?: string
  custom_letters?: string
  // WHO IS PLAYING — a field like any other, and the only one that is not
  // part of the setup blob: `create_game` takes it as its own argument and
  // writes `common.game_players` rows from it.
  player_user_ids: Set<string>
}


/** What is SENT and STORED — every value the form collects except the players
 *  (see `SetupOf`). This is the shape `common.games.setup` holds, and what
 *  `setupSummary.ts` and `PlayArea` read back. */
export type SpellingbeeSetup = SetupOf<SpellingbeeValues>
/**
 * Why the current `legal_band` is too low to start, or `null`: the legal set
 * must contain the required set, so `legal_band >= required_band`. The dialog
 * gates Start on this (via the manifest's `validate`); `create_game` re-checks
 * server-side.
 */
export function legalError(setup: SpellingbeeSetup): FormErrors {
  if (setup.legal_band < setup.required_band) {
    return { legal_band: `Legal words must reach at least the required band (${setup.required_band}).` }
  }
  return {}
}

/** Every message `customLettersError` gives is about the ONE field the letters
 *  are typed into — the form writes both `custom_center` and `custom_letters`
 *  from a single box — so they all wear that key. */
const bad = (message: string): FormErrors => ({ custom_letters: message })

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
export function customLettersError(setup: SpellingbeeSetup): FormErrors {
  const center = (setup.custom_center ?? '').trim().toLowerCase()
  const letters = (setup.custom_letters ?? '').trim().toLowerCase()
  if (!center && !letters) return {} // both blank → random board
  if (!center || !letters) {
    return bad('Enter a center letter AND six other letters, or leave both blank.')
  }
  if (!/^[a-z]$/.test(center)) return bad('The center must be a single letter A–Z.')
  if (!/^[a-z]{6}$/.test(letters)) return bad('Enter exactly six other letters (A–Z).')
  if (center === 's' || letters.includes('s')) {
    return bad("Spelling Bee never uses the letter S — pick different letters.")
  }
  if (new Set(center + letters).size !== 7) return bad('All seven letters must be different.')
  return {}
}

/**
 * The single Start-gate validator for both manifests: the legal-band rule and
 * the custom-letters rule, each under its own field. The manifest's `validate`
 * returns it, and Start stays disabled while it holds any error.
 */
export function spellingbeeSetupError(setup: SpellingbeeSetup): FormErrors {
  return { ...legalError(setup), ...customLettersError(setup) }
}

/**
 * Initial setup for the coop manifest. No `target_rank`: the default coop game
 * is the open-ended hunt (find words until you stop) — a team that wants a
 * finish line picks one in the dialog's "Win at" field, and then reaching it
 * ends the game as a win. The timer starts off; players pick a clock too.
 */
export const DEFAULT_SPELLINGBEE_SETUP_COOP: SpellingbeeSetup = {
  timer: { kind: 'none' },
  required_band: 3,
  legal_band: 5,
}

/**
 * Initial setup for the compete manifest: the coop one plus a target rank,
 * since a race needs a finish line. The dialog's picker changes it per game.
 */
export const DEFAULT_SPELLINGBEE_SETUP_COMPETE: SpellingbeeSetup = {
  timer: { kind: 'none' },
  target_rank: 5,
  required_band: 3,
  legal_band: 5,
}
