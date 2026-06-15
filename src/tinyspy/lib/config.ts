/**
 * Tinyspy's per-game setup config — collected by the start-game
 * dialog, persisted to `tinyspy.games.config`, and validated
 * server-side in `tinyspy.create_game` (the canonical authority
 * for what shapes are accepted).
 *
 * The literal-union on `turns` mirrors the SQL check; the
 * TypeScript narrowing here is advisory (a curious client could
 * always send something else). The server rejects anything that
 * doesn't match — see the migration's validation block.
 *
 * Lives in `lib/` rather than inline in `manifest.ts` so the
 * Setup body component can import the same type without dragging
 * the whole manifest in (which would defeat the lazy-load
 * point — the manifest's setup field would prevent code-splitting
 * the form's chunk).
 */
export type TinyspyConfig = {
  /**
   * Starting timer-token count. Matches the Duet rulebook's
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
}

/**
 * Initial config the manifest hands the SetupGameDialog wrapper
 * as `defaults`. `firstClueGiverUserId` starts empty — the
 * defaults are evaluated at module-load time, before any club
 * is known, so a real user-id can't be filled in until the body
 * mounts inside a specific club's dialog. The Setup component
 * auto-picks the first member on mount.
 */
export const DEFAULT_TINYSPY_CONFIG: TinyspyConfig = {
  turns: 9,
  firstClueGiverUserId: '',
}

/** The allowed `turns` values — drives the radio rendering. */
export const TURN_OPTIONS = [9, 10, 11] as const
