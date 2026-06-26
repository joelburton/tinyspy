import type { TimerMode } from '../../common/lib/games'

/**
 * codenamesduet's per-game setup — the choices collected by the
 * start-game dialog, persisted to `common.games.setup`, and
 * validated server-side in `codenamesduet.create_game` (the canonical
 * authority for what shapes are accepted).
 *
 * The literal-union on `turns` mirrors the SQL check; the
 * TypeScript narrowing here is advisory (a curious client could
 * always send something else). The server rejects anything that
 * doesn't match — see the migration's validation block.
 *
 * Lives in `lib/` rather than inline in `manifest.ts` so the
 * SetupForm component can import the same type without dragging
 * the whole manifest in (which would defeat the lazy-load
 * point — the manifest's setupForm field would prevent
 * code-splitting the form's chunk).
 */
export type CodenamesduetSetup = {
  /**
   * Starting turn count. Matches the Duet rulebook's
   * mission/campaign starting values for easier difficulties (9
   * is the standard game; 10 and 11 are the easier missions).
   */
  turns: 9 | 10 | 11
  /**
   * UUID of the club member who gives the first clue. The RPC
   * seats this user as A (since A always opens the game) and
   * the other member as B. Without this option, A was always
   * the caller of create_game — arbitrary in the worst way
   * (a UI race condition decided who went first). The dialog
   * makes it an explicit player choice.
   */
  firstClueGiverUserId: string
  /**
   * Browser-side wall-clock timer mode. `none` (no clock) and
   * `countup` (informational) are display-only; `countdown`
   * flips the game to `lost_timeout` when the clock hits 0 (via
   * codenamesduet.submit_timeout). Validated server-side by
   * `common.validate_timer`.
   *
   * Distinct from the rulebook's `turns` above — that's the
   * in-game turn budget (the `turns_remaining` clock); this is the
   * external wall-clock countdown players can choose to layer
   * on top.
   */
  timer: TimerMode
}

/**
 * Initial setup the manifest hands the SetupGameDialog wrapper
 * as `defaults`. `firstClueGiverUserId` starts empty — the
 * defaults are evaluated at module-load time, before any club
 * is known, so a real user-id can't be filled in until the body
 * mounts inside a specific club's dialog. The SetupForm
 * component auto-picks the first member on mount.
 *
 * Timer defaults to `none` — Duet's pacing already comes from
 * the turn budget; a wall-clock countdown is opt-in for
 * players who want extra pressure.
 */
export const DEFAULT_CODENAMESDUET_SETUP: CodenamesduetSetup = {
  turns: 9,
  firstClueGiverUserId: '',
  timer: { kind: 'none' },
}

/** The allowed `turns` values — drives the radio rendering. */
export const TURN_OPTIONS = [9, 10, 11] as const
