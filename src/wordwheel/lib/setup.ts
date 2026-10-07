// cs-blessed-wordwheel

import type { FormErrors } from '@/common/forms/formState'
import type { GSetup } from '../types'

/**
 * Why the current `legal_band` is too low to start, under `legal_band`; `{}`
 * when it isn't: the legal set must contain the required set, so
 * `legal_band >= required_band`. The dialog gates Start on this (via the
 * manifest's `validate`); `create_game` re-checks server-side.
 */
export function legalError(setup: GSetup): FormErrors {
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
 * Why the optional custom-letters override is invalid, under `custom_letters`;
 * `{}` when it's fine (including the common "left blank" case → a random
 * board).
 *
 * Mirrors the letter rules `wordwheel.create_game` enforces server-side, so the
 * dialog fails fast before the round-trip: if EITHER field is filled, BOTH must
 * be, and together they must be exactly one center + eight other letters,
 * lowercase a–z. DUPLICATES ARE ALLOWED — the wheel is a multiset, so a repeated
 * letter just means two tiles carry it (and the center may repeat an outer).
 * Unlike spellingbee, 's' IS allowed — word wheel spends a tile per use, so 's'
 * can't pluralize explosively. Case/whitespace are normalized here the same way
 * the SetupForm cleans its inputs.
 */
export function customLettersError(setup: GSetup): FormErrors {
  const center = (setup.custom_center ?? '').trim().toLowerCase()
  const letters = (setup.custom_letters ?? '').trim().toLowerCase()
  if (!center && !letters) return {} // both blank → random board
  if (!center || !letters) {
    return bad('Enter a center letter AND eight other letters, or leave both blank.')
  }
  if (!/^[a-z]$/.test(center)) return bad('The center must be a single letter A–Z.')
  if (!/^[a-z]{8}$/.test(letters)) return bad('Enter exactly eight other letters (A–Z).')
  return {}
}

/**
 * The single Start-gate validator for both manifests: the legal-band rule and
 * the custom-letters rule, each under its own field. The manifest's `validate`
 * returns it, and Start stays disabled while it holds any error.
 */
export function wordwheelSetupError(setup: GSetup): FormErrors {
  return { ...legalError(setup), ...customLettersError(setup) }
}

/**
 * Initial setup for the coop manifest. No `target_rank`: the default coop
 * game's goal is every required word — a team that wants a nearer finish line
 * picks one in the dialog's "Win at" field. Either goal reached ends the game
 * as a win. The timer starts off; players pick a clock too.
 */
export const DEFAULT_WORDWHEEL_SETUP_COOP: GSetup = {
  timer: { kind: 'none' },
  required_band: 3,
  legal_band: 5,
}

/**
 * Initial setup for the compete manifest: the coop one plus a target rank,
 * since a race needs a finish line. The dialog's picker changes it per game.
 */
export const DEFAULT_WORDWHEEL_SETUP_COMPETE: GSetup = {
  timer: { kind: 'none' },
  target_rank: 5,
  required_band: 3,
  legal_band: 5,
}
