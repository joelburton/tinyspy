import type { TimerMode } from '../../common/lib/games'
import type { BoardConstraints } from './generate'
import type { LadderName } from './solver'
import { LADDERS } from './solver'
import { DICE_BY_NAME } from './dice'
import { parseCustomBoard } from './customBoard'

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
  /** Win-on-target: the percent of the required-words SCORE a player (compete)
   *  or the team (coop) must reach to win — one of 50, 55, … 100 — or `null`
   *  for "no target" (play until manual End or the timer expires). Measured
   *  against the score of the REQUIRED words found ONLY — bonus finds don't
   *  count — so 100% means every required word, 50% means required finds worth
   *  half the required total. */
  win_percent: number | null
  constraints?: BoardConstraints
  /**
   * An OPTIONAL player-typed board — the tiles themselves, written the way the
   * recap prints them (`"ABQuD EFGH IJKL MNOP"`; see `lib/customBoard.ts`).
   * Set → the edge function solves exactly this board instead of rolling one;
   * blank/absent → the normal roll. Either mode.
   *
   * Stored AS TYPED rather than as the internal face string: the field has to
   * survive half-finished input (you can't hold a partial board in a canonical
   * encoding), and keeping the text means what you pasted is what you see. The
   * server re-parses — it never trusts the client's reading.
   *
   * Because the player chose the tiles, a custom board skips BOTH the
   * `constraints` targets (nothing is being rejection-sampled) and the roll
   * loop's quality bar; it need only yield ≥1 required word, or `win_percent`
   * would compute a threshold of zero. It is NOT saved as the club's next
   * default — a one-off, not a new baseline (see `boggle.create_game`).
   */
  custom_board?: string
}

/** The `win_percent` dropdown options: None (null) + 50…100 by 5. */
export const WIN_PERCENT_OPTIONS: ReadonlyArray<number | null> = [
  null, 50, 55, 60, 65, 70, 75, 80, 85, 90, 95, 100,
]

/** Coop default: 4×4 Revised board, familiar band, standard scoring, no timer. */
export const DEFAULT_BOGGLE_SETUP_COOP: BoggleSetup = {
  timer: { kind: 'none' },
  dice_set: '4',
  band: 3,
  legal_band: 5,
  min_word_length: 3,
  scoring_ladder: 'basic',
  win_percent: null,
  constraints: {
    minWordLength: 3,
    ladder: "basic",
    minWords: 10,
    maxWords: undefined,
    minScore: 20,
    maxScore: undefined,
    minLongest: 5,
    maxLongest: undefined,
  }
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
  if (
    s.win_percent !== null &&
    (s.win_percent < 50 || s.win_percent > 100 || s.win_percent % 5 !== 0)
  ) {
    return 'Win target must be 50–100% in steps of 5, or None'
  }
  return null
}

/**
 * Why the optional custom board is unusable, or `null` if it's fine (including
 * the common "left blank" case → a rolled board).
 *
 * The tile count is judged against the DICE SET currently picked, since that's
 * what fixes the board's side length — paste a 5×5 while the dialog says 4×4
 * and this says so, rather than guessing which of the four 5×5 sets you meant.
 * `parseCustomBoard` owns the reading itself, and the edge function calls the
 * same function server-side; this is the fail-fast, not the authority.
 */
export function customBoardError(s: BoggleSetup): string | null {
  const text = (s.custom_board ?? '').trim()
  if (!text) return null // blank → roll a board, the normal path
  const set = DICE_BY_NAME[s.dice_set]
  // An unknown dice set is `legalError`'s to report, and it runs first; without
  // a set there's no side length to check the tile count against.
  if (!set) return null
  const parsed = parseCustomBoard(text, set.n)
  return parsed.ok ? null : parsed.error
}

/**
 * The single Start-gate validator for both manifests: the cross-field setup
 * rules OR the custom-board rules, whichever fails first (the manifest's
 * `validate` shows the returned string and disables Start until it's `null`).
 * Mirrors freebee's `spellingbeeSetupError`.
 */
export function boggleSetupError(s: BoggleSetup): string | null {
  return legalError(s) ?? customBoardError(s)
}
