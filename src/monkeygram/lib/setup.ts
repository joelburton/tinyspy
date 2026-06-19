import type { TimerMode } from '../../common/lib/games'

/**
 * MonkeyGram's per-game setup — the choices the start-game dialog
 * collects, persisted to `common.games.setup`, and validated
 * server-side in `monkeygram.create_game` (the canonical authority
 * for what shapes are accepted).
 *
 * v1 has a single real choice (starter hand size); the literal-union
 * mirrors the SQL `check`. `timer` is carried as `{ kind: 'none' }`
 * so the common timer machinery has a value to read — v1 is untimed,
 * but a later version can offer a count-up without a setup-shape
 * change.
 *
 * Lives in `lib/` (not inline in `manifest.ts`) so the SetupForm body
 * can import the type without dragging the manifest into its chunk.
 */
export type MonkeyGramSetup = {
  /** How many tiles each player is dealt to start. 21 is the
   *  Bananagrams 2–4-player default; 15 is a quicker game. */
  hand_size: 15 | 21
  /** Untimed in v1 (`{ kind: 'none' }`). Validated server-side by
   *  `common.validate_timer`. */
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
