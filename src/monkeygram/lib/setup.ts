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
  /** How many tiles the bag holds for this game, 1..144. The full
   *  Bananagrams set is 144; a smaller bag (a random subset) makes a
   *  shorter game. MUST be ≥ `playerCount × hand_size` so the deal is
   *  possible — `bagSizeError` enforces it in the dialog, and
   *  `create_game` re-checks server-side. */
  bag_size: number
  /** Shared timer mode. `none` and `countup` are display-only; a
   *  `countdown` that hits 0 ends the game as a loss for everyone
   *  (`monkeygram.submit_timeout`). Validated server-side by
   *  `common.validate_timer`. Defaults to `none` (opt-in pressure). */
  timer: TimerMode
}

/** The full Bananagrams bag — the hard cap on `bag_size`. */
export const MONKEYGRAM_BAG_MAX = 144

/** Initial setup the manifest hands the SetupGameDialog wrapper as
 *  `defaults`. Defaults to the full 144-tile bag (the classic game). */
export const DEFAULT_MONKEYGRAM_SETUP: MonkeyGramSetup = {
  hand_size: 21,
  bag_size: MONKEYGRAM_BAG_MAX,
  timer: { kind: 'none' },
}

/** The allowed `hand_size` values — drives the radio rendering and
 *  matches the SQL `check (hand_size in (15, 21))`. */
export const HAND_SIZE_OPTIONS = [15, 21] as const

/**
 * The number of tiles a game needs to deal: one starter hand per player.
 * Drives both the bag-size hint and the gate below.
 */
export function tilesNeeded(setup: MonkeyGramSetup, playerCount: number): number {
  return playerCount * setup.hand_size
}

/**
 * Why the current `bag_size` can't start a game, or `null` if it's fine.
 * The dialog uses this to gate Start (via the manifest's `validate`) and
 * the SetupForm shows it inline. Mirrors `create_game`'s server-side
 * checks: 1..144, and big enough to deal every player their hand.
 */
export function bagSizeError(
  setup: MonkeyGramSetup,
  playerCount: number,
): string | null {
  const { bag_size } = setup
  if (!Number.isInteger(bag_size) || bag_size < 1) {
    return 'Bag size must be a whole number of at least 1.'
  }
  if (bag_size > MONKEYGRAM_BAG_MAX) {
    return `The bag holds at most ${MONKEYGRAM_BAG_MAX} tiles.`
  }
  const needed = tilesNeeded(setup, playerCount)
  if (bag_size < needed) {
    return `Bag too small: ${playerCount} player${playerCount === 1 ? '' : 's'} × ${setup.hand_size} tiles = ${needed} to deal. Add tiles or lower the starter hand.`
  }
  return null
}
