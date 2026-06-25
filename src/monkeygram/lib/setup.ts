import type { TimerMode } from '../../common/lib/games'

/**
 * MonkeyGram's per-game setup — the choices the start-game dialog
 * collects, persisted to `common.games.setup`, and validated
 * server-side in `monkeygram.create_game` (the canonical authority
 * for what shapes are accepted).
 *
 * Two choices: starter hand size (the literal-union mirrors the SQL
 * `check`) and the shared `timer` mode. A countdown that reaches 0 ends
 * the race as a collective loss (`monkeygram.submit_timeout`) — time's
 * up with nobody out.
 *
 * Lives in `lib/` (not inline in `manifest.ts`) so the SetupForm body
 * can import the type without dragging the manifest into its chunk.
 */
export type MonkeyGramSetup = {
  /** How many tiles each player is dealt to start. 21 is the
   *  Bananagrams 2–4-player default; 15 is a quicker game. */
  hand_size: 15 | 21
  /** Shared timer mode. `none` and `countup` are display-only; a
   *  `countdown` that hits 0 ends the game as a loss for everyone
   *  (`monkeygram.submit_timeout`). Validated server-side by
   *  `common.validate_timer`. Defaults to `none` (opt-in pressure). */
  timer: TimerMode
}

/** Initial setup the manifest hands the SetupGameDialog wrapper as
 *  `defaults`. */
export const DEFAULT_MONKEYGRAM_SETUP: MonkeyGramSetup = {
  hand_size: 21,
  timer: { kind: 'none' },
}

/** The allowed `hand_size` values — drives the radio rendering and
 *  matches the SQL `check (hand_size in (15, 21))`. */
export const HAND_SIZE_OPTIONS = [15, 21] as const
