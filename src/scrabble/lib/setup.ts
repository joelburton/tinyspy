import type { TimerMode } from '../../common/lib/games'

/**
 * RackAttack's per-game setup — collected by the start-game dialog, persisted
 * to `common.games.setup`, validated server-side by `scrabble.create_game`
 * (the authority). Coop and compete share the shape; mode is locked at the
 * gametype level, not chosen here.
 *
 * Lives in `lib/` rather than `manifest.ts` so the SetupForm body can import
 * the type without pulling the manifest into its lazy chunk.
 */
export type ScrabbleSetup = {
  /**
   * The dictionary bands that gate word acceptance, by word length (both
   * 1..6, `common.words.difficulty`). 2-letter words are a thin, separate
   * vocabulary, so they get their own band (`dict_2`) from the longer words
   * (`dict_3plus`) — the same split MonkeyGram uses. Unlike most games these
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
}

/** Initial setup the manifest hands the dialog. Band 3 = "Familiar". */
export const DEFAULT_SCRABBLE_SETUP: ScrabbleSetup = {
  dict_2: 3,
  dict_3plus: 3,
  timer: { kind: 'none' },
}
