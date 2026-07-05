import type { TimerMode } from '../../common/lib/games'

/**
 * bananagrams's per-game setup — the choices the start-game dialog
 * collects, persisted to `common.games.setup`, and validated
 * server-side in `bananagrams.create_game` (the canonical authority
 * for what shapes are accepted).
 *
 * The choices: starter hand size (the literal-union mirrors the SQL
 * `check`), bag size, the 3-way word check with its two difficulty
 * bands (`word_check` / `dict_2` / `dict_3plus`), where a dumped tile
 * goes (`dump_to_box`), and the shared `timer` mode. A countdown that
 * reaches 0 ends the race as a collective loss
 * (`bananagrams.submit_timeout`) — time's up with nobody out.
 *
 * Lives in `lib/` (not inline in `manifest.ts`) so the SetupForm body
 * can import the type without dragging the manifest into its chunk.
 */

/**
 * How strictly the board's words are checked (see the `word_check` field):
 * `'off'` never, `'win'` on the winning peel, `'strict'` on every peel.
 */
export type WordCheck = 'off' | 'win' | 'strict'

export type BananagramsSetup = {
  /** How many tiles each player is dealt to start. 21 is the
   *  Bananagrams 2–4-player default; 15 is a quicker game. */
  hand_size: 15 | 21
  /** How many tiles the bag holds for this game, 1..144. The full
   *  Bananagrams set is 144; a smaller bag (a random subset) makes a
   *  shorter game. MUST be ≥ `playerCount × hand_size` so the deal is
   *  possible — `bagSizeError` enforces it in the dialog, and
   *  `create_game` re-checks server-side. */
  bag_size: number
  /**
   * How strictly real words are enforced (`bananagrams._win_blockers`; offending
   * tiles flash red):
   *   - `'off'`    — classic trust-the-friends Bananagrams, no word check.
   *   - `'win'`    — a WINNING peel requires every word on the board to be real.
   *   - `'strict'` — EVERY peel requires it; you can't peel with an invalid board
   *                  (so the win check then comes for free).
   * Default `'off'`. NOTE: board GEOGRAPHY (one connected grid) is always
   * required to win regardless of this — it's structural, not a matter of taste.
   */
  word_check: WordCheck
  /** Obscurity ceiling for **2-letter** words, 2..6 (`common.words`
   *  difficulty): a 2-letter word is legal iff it exists at difficulty ≤ this.
   *  2-letter words are a thin, separate vocabulary, so they get their own band
   *  (and band 1 is too sparse to be fun, hence the 2 floor). Only meaningful
   *  when `word_check` isn't `'off'`. */
  dict_2: number
  /** Obscurity ceiling for **3+-letter** words, 1..6 (`common.words`
   *  difficulty). Only meaningful when `word_check` isn't `'off'`. */
  dict_3plus: number
  /** Where a dumped tile goes. `false` (default) = back into the bag (it may
   *  be drawn again). `true` = to the out-of-play "box", so the bunch depletes
   *  (the game ends sooner) — though a dump can top up from the box when the
   *  bunch is short. The player still draws `dump_count` either way. */
  dump_to_box: boolean
  /** Shared timer mode. `none` and `countup` are display-only; a
   *  `countdown` that hits 0 ends the game as a loss for everyone
   *  (`bananagrams.submit_timeout`). Validated server-side by
   *  `common.validate_timer`. Defaults to `none` (opt-in pressure). */
  timer: TimerMode
}

/** The full Bananagrams bag — the hard cap on `bag_size`. */
export const BANANAGRAMS_BAG_MAX = 144

/** Initial setup the manifest hands the SetupGameDialog wrapper as
 *  `defaults`. Full 144-tile bag, no word check (the classic game). */
export const DEFAULT_BANANAGRAMS_SETUP: BananagramsSetup = {
  hand_size: 15,
  bag_size: BANANAGRAMS_BAG_MAX,
  word_check: 'off',
  dict_2: 4,
  dict_3plus: 4,
  dump_to_box: false,
  timer: { kind: 'none' },
}

/** The allowed `hand_size` values — drives the radio rendering and
 *  matches the SQL `check (hand_size in (15, 21))`. */
export const HAND_SIZE_OPTIONS = [15, 21] as const

/** The `word_check` radio options, in escalating strictness — drives the
 *  SetupForm control and matches the SQL `word_check in ('off','win','strict')`. */
export const WORD_CHECK_OPTIONS: ReadonlyArray<{ value: WordCheck; label: string }> = [
  { value: 'off', label: 'Off' },
  { value: 'win', label: 'At win' },
  { value: 'strict', label: 'Every peel' },
]

/**
 * The number of tiles a game needs to deal: one starter hand per player.
 * Drives both the bag-size hint and the gate below.
 */
export function tilesNeeded(setup: BananagramsSetup, playerCount: number): number {
  return playerCount * setup.hand_size
}

/**
 * Why the current `bag_size` can't start a game, or `null` if it's fine.
 * The dialog uses this to gate Start (via the manifest's `validate`) and
 * the SetupForm shows it inline. Mirrors `create_game`'s server-side
 * checks: 1..144, and big enough to deal every player their hand.
 */
export function bagSizeError(
  setup: BananagramsSetup,
  playerCount: number,
): string | null {
  const { bag_size } = setup
  if (!Number.isInteger(bag_size) || bag_size < 1) {
    return 'Bag size must be a whole number of at least 1.'
  }
  if (bag_size > BANANAGRAMS_BAG_MAX) {
    return `The bag holds at most ${BANANAGRAMS_BAG_MAX} tiles.`
  }
  const needed = tilesNeeded(setup, playerCount)
  if (bag_size < needed) {
    return `Bag too small: ${playerCount} player${playerCount === 1 ? '' : 's'} × ${setup.hand_size} tiles = ${needed} to deal. Add tiles or lower the starter hand.`
  }
  return null
}
