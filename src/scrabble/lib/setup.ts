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
   * The dictionary band that gates word acceptance: a word is legal iff its
   * `common.words.difficulty` ≤ this (1..6). Unlike most games, this band IS
   * the acceptance bar — picking a lower band genuinely makes a stricter game.
   * The form offers all six; the server bounds it. See docs/games/scrabble.md
   * §3.3.
   */
  difficulty: number
  /**
   * Timer mode. `none` / `countup` are informational; a `countdown` ends the
   * game on expiry via `scrabble.submit_timeout`.
   */
  timer: TimerMode
}

/** Initial setup the manifest hands the dialog. Band 3 = "Familiar". */
export const DEFAULT_SCRABBLE_SETUP: ScrabbleSetup = {
  difficulty: 3,
  timer: { kind: 'none' },
}
