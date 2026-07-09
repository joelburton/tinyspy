import type { TimerMode } from '../../common/lib/games'
import { difficultyValue } from '../../common/lib/game/difficulty'

/**
 * scrabble's per-game setup — collected by the start-game dialog, persisted
 * to `common.games.setup`, validated server-side by `scrabble.create_game`
 * (the authority). Coop and compete share the shape; mode is locked at the
 * gametype level, not chosen here.
 *
 * Lives in `lib/` rather than `manifest.ts` so the SetupForm body can import
 * the type without pulling the manifest into its lazy chunk. Deliberately does
 * NOT import policy.ts (the AI engine) — the level→band map below is a tiny
 * mirror of policy's `LEVELS` vocabCaps, kept local so the setup chunk stays
 * light; the server re-derives it in create_game and remains the authority.
 */
export type ScrabbleSetup = {
  /**
   * The dictionary bands that gate word acceptance, by word length (both
   * 1..6, `common.words.difficulty`). 2-letter words are a thin, separate
   * vocabulary, so they get their own band (`dict_2`) from the longer words
   * (`dict_3plus`) — the same split bananagrams uses. Unlike most games these
   * ARE the acceptance bar: a lower band genuinely makes a stricter game. The
   * server bounds them. See docs/games/scrabble.md §3.3.
   */
  dict_2: number
  dict_3plus: number
  /**
   * Timer mode. `none` / `countup` are informational; a `countdown` ends the
   * game on expiry via `scrabble.submit_timeout`.
   */
  timer: TimerMode
  /**
   * AI opponents (compete only; docs/scrabble-ai-strength.md). `ai_count`
   * (0..3) seats that many AI players, all at `ai_level`. Ignored in coop.
   */
  ai_count: number
  ai_level: AiLevel
}

/** The five AI strength levels (policy.ts `LEVELS`), weakest → strongest. */
export const AI_LEVELS = ['beginner', 'casual', 'intermediate', 'strong', 'best'] as const
export type AiLevel = (typeof AI_LEVELS)[number]

export const AI_LEVEL_LABEL: Record<AiLevel, string> = {
  beginner: 'Beginner',
  casual: 'Casual',
  intermediate: 'Intermediate',
  strong: 'Strong',
  best: 'Best',
}

/** The dictionary band each level needs (its `vocabCap` — beginner 1 … strong/
 *  best 6). The game's bands must be ≥ this whenever an AI is present, or the AI
 *  can't play at its tuned strength (docs/scrabble-ai-strength.md band rule). */
export const AI_BAND: Record<AiLevel, number> = {
  beginner: 1,
  casual: 2,
  intermediate: 4,
  strong: 6,
  best: 6,
}

/** Initial setup the manifest hands the dialog. Band 3 = "Familiar"; no AI. */
export const DEFAULT_SCRABBLE_SETUP: ScrabbleSetup = {
  dict_2: 3,
  dict_3plus: 3,
  timer: { kind: 'none' },
  ai_count: 0,
  ai_level: 'strong',
}

/**
 * Compete setup validation (the friendly front door — `create_game` re-checks
 * as the authority). Returns a blocking error message, or null when valid.
 * Only bites when an AI is present:
 *   - the total (humans + AI) must fit 2..4;
 *   - both dictionary bands must be ≥ the AI level's band. Crucially we do NOT
 *     auto-raise the dictionary (a silent change would be a trap) — we ask the
 *     player to raise it themselves (Joel's call).
 */
export function validateScrabbleSetup(setup: unknown, playerCount: number): string | null {
  const s = setup as ScrabbleSetup
  const ai = s.ai_count ?? 0
  if (ai === 0) return null
  const total = playerCount + ai
  if (total > 4) return `Too many players — ${playerCount} human + ${ai} AI is over the limit of 4.`
  if (total < 2) return 'A compete game needs at least 2 players (humans + AI).'
  const band = AI_BAND[s.ai_level]
  if (s.dict_2 < band || s.dict_3plus < band) {
    return (
      `A ${AI_LEVEL_LABEL[s.ai_level]} AI needs the dictionary at “${difficultyValue(band)}” or wider — ` +
      `raise both dictionaries to at least that before adding it.`
    )
  }
  return null
}
