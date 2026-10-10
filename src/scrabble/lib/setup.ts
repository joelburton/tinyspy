// cs-unmet

import type { FormErrors } from '@/common/forms/formState'
import { dictBandValue } from '@/common/setup-form/dictBand'
import type { GAiLevel, GSetup } from '../types'

/**
 * scrabble's setup defaults and checks. The setup is collected by the
 * start-game dialog, persisted to `common.games.setup`, validated server-side
 * by `scrabble.create_game` (the authority). Coop and compete share the shape;
 * mode is locked at the gametype level, not chosen here.
 *
 * Lives in `lib/` rather than `manifest.ts` so the SetupForm body can import
 * it without pulling the manifest into its lazy chunk. Deliberately does
 * NOT import policy.ts (the AI's move choice) — the level→band map below is a
 * tiny mirror of policy's `LEVELS` vocabCaps, kept local so the setup chunk
 * stays light; the server re-derives it in create_game and remains the
 * authority.
 */

export const AI_LEVEL_LABEL: Record<GAiLevel, string> = {
  beginner: 'Beginner',
  casual: 'Casual',
  intermediate: 'Intermediate',
  strong: 'Strong',
  best: 'Best',
}

/** The dictionary band each level needs (its `vocabCap` — beginner 1 … strong/
 *  best 6). The game's bands must be ≥ this whenever an AI is present, or the AI
 *  can't play at its tuned strength (docs/games/scrabble.md → The band rule). */
export const AI_BAND: Record<GAiLevel, number> = {
  beginner: 1,
  casual: 2,
  intermediate: 4,
  strong: 6,
  best: 6,
}

/** Initial setup the manifest hands the dialog. Band 3 = "Familiar"; no AI. */
export const DEFAULT_SCRABBLE_SETUP: GSetup = {
  dict_2: 3,
  dict_3plus: 3,
  timer: { kind: 'none' },
  ai_count: 0,
  ai_level: 'strong',
  // Coop pacing: free-for-all by default; the "Co-op" setup section (coop,
  // 2+ players) offers turn-by-turn. first_turn_user_id is seeded by the field.
  coop_style: 'free-for-all',
}

/**
 * Compete setup validation (the friendly front door — `create_game` re-checks
 * as the authority). Returns the blocking errors by field; empty when valid.
 *   - the total (humans + AI) must fit 2..4, so one person alone must add an
 *     AI;
 *   - with an AI, both dictionary bands must be ≥ its level's band. Crucially
 *     we do NOT auto-raise the dictionary (a silent change would be a trap) —
 *     we ask the player to raise it themselves (Joel's call).
 */
export function validateScrabbleSetup(setup: unknown, playerCount: number): FormErrors {
  const s = setup as GSetup
  const ai = s.ai_count ?? 0
  const total = playerCount + ai
  // The headcount ones go on `ai_count`: the human count is the club roster's
  // checkboxes, and the number you can actually change to fix this is the AI's.
  if (total > 4) {
    return { ai_count: `Too many players — ${playerCount} human + ${ai} AI is over the limit of 4.` }
  }
  if (total <
    2) return { ai_count: 'A compete game needs at least 2 players (humans + AI).' }
  // A table of humans plays at any band.
  if (ai === 0) return {}
  const band = AI_BAND[s.ai_level]
  if (s.dict_2 < band || s.dict_3plus < band) {
    // TWO fields at once — the case a server raise cannot express, because a
    // raise stops at the first failure. Only the ones actually below the band
    // are rung, so a setup with one dictionary already wide enough doesn't get
    // a red box around the select that is fine.
    const message =
      `A ${AI_LEVEL_LABEL[s.ai_level]} AI needs the dictionary at “${dictBandValue(
        band)}” or wider — ` +
      `raise both dictionaries to at least that before adding it.`
    return {
      ...(s.dict_2 < band ? { dict_2: message } : {}),
      ...(s.dict_3plus < band ? { dict_3plus: message } : {}),
    }
  }
  return {}
}
