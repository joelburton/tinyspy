/**
 * "Is this failure just the game having already ended?" — the one server error
 * a gallery builder EXPECTS.
 *
 * Every win-building builder has the same shape: submit moves until the game
 * ends, where the ending is the point. Which move ends it isn't knowable up
 * front (the winning word depends on the rank ladder, the fifteenth agent can
 * fall anywhere in a run), so the builders submit their whole list and treat
 * "game's over" as the success signal — anything else is a real failure and
 * throws.
 *
 * ── Why this is a module and not four `includes()` calls ────────────────────
 * It was four `includes()` calls, and they all rotted at once. They matched on
 * PROSE — `'not in progress'`, `'active play'` — and the server-error-keys work
 * replaced that prose with the key `game-not-in-play|`. Nothing failed loudly:
 * the guards simply stopped matching, so every builder threw on the move that
 * was supposed to mean success, and FreeBee's and MooseWheel's `won` cells went
 * missing from the contact sheet on every run.
 *
 * Matching the KEY is the fix, and having exactly one place that knows the key
 * is what makes the next rename a one-line change instead of four silent
 * regressions. See docs/supabase.md → Server errors for the `key|detail|` shape.
 *
 * Deliberately NOT imported from `src/common/lib/game/serverError.ts`, which
 * has a real parser: nothing under `e2e/` imports app code — the harness talks
 * to the running app and the database, and stays a black box on purpose. (It
 * would also be a silent-at-runtime dependency, since `e2e/` is in no tsconfig
 * project and neither `tsc -b` nor eslint reads it.)
 */

/** The key every RPC raises when the game is no longer in play. */
const GAME_OVER_KEY = 'game-not-in-play|'

/**
 * True when a failed RPC failed only because the game had already finished.
 *
 * Anchored at the start, and the trailing `|` is part of the constant, so it
 * can't half-match a longer key that happens to share the prefix.
 */
export function gameAlreadyOver(error: { message?: string } | null | undefined): boolean {
  return (error?.message ?? '').startsWith(GAME_OVER_KEY)
}
