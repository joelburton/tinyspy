import type { TimerMode } from '../../common/lib/games'
import type { BoardConstraints } from './generate'
import type { LadderName } from './solver'
import { LADDERS } from './solver'
import { DICE_BY_NAME } from './dice'

/**
 * The setup blob the dialog collects and `boggle.create_game` validates. `mode`
 * is NOT here — it's a top-level manifest/RPC arg (the sibling-pair split).
 * `constraints` are the optional board-generation targets (min/max words, score,
 * longest word) measured against the required words.
 */
export interface BoggleSetup {
  timer: TimerMode
  dice_set: string
  /** required-word difficulty band, 1 (universal) … 6 (expert) — the words the
   *  board generator guarantees are findable (clean: american, no slur/crude/slang) */
  band: number
  /** legal (bonus) difficulty band, `band`…6 — the ceiling for words that aren't
   *  required but still score. Filters on difficulty ONLY (any dialect/slur/
   *  crude/slang qualifies), so it's the wider net of "real words you might find". */
  legal_band: number
  min_word_length: number
  scoring_ladder: LadderName
  constraints?: BoardConstraints
}

/** Coop default: 4×4 Revised board, familiar band, standard scoring, no timer. */
export const DEFAULT_BOGGLE_SETUP_COOP: BoggleSetup = {
  timer: { kind: 'none' },
  dice_set: '4',
  band: 3,
  legal_band: 5,
  min_word_length: 3,
  scoring_ladder: 'basic',
}

/** Compete shares the coop defaults (mode is a positional RPC arg). */
export const DEFAULT_BOGGLE_SETUP_COMPETE: BoggleSetup = { ...DEFAULT_BOGGLE_SETUP_COOP }

/** Cross-field guard for the Start button. Pure + synchronous; `create_game`
 *  re-validates server-side (this is UX, not the authority). */
export function legalError(s: BoggleSetup): string | null {
  if (!DICE_BY_NAME[s.dice_set]) return `Unknown dice set: ${s.dice_set}`
  if (s.band < 1 || s.band > 6) return 'Difficulty band must be 1–6'
  if (s.legal_band < s.band || s.legal_band > 6) return 'Legal-word band must be between the required band and 6'
  if (s.min_word_length < 3 || s.min_word_length > 9) return 'Minimum word length must be 3–9'
  if (!(s.scoring_ladder in LADDERS)) return `Unknown scoring ladder: ${s.scoring_ladder}`
  return null
}
