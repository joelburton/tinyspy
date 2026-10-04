// cs-unmet

/**
 * Per-game timer declaration, consumed by `useGameTimer`:
 *
 *   - `none` — no timer.
 *   - `countup` — display-only: the count of seconds somebody was
 *     playing, shown as it climbs. Drives no state change.
 *   - `countdown` — `seconds` minus that count. At zero,
 *     `useGameTimer.expired` is true; `GamePage` fires the gametype's
 *     `submitTimeout` on that edge, which ends the game.
 *
 * The count is the server's (`common.timers.ticks`, advanced by
 * `common.tick_timer`); the design is `src/common/timer/doc.md`.
 */
export type TimerMode =
  | { kind: 'none' }
  | { kind: 'countup' }
  | { kind: 'countdown'; seconds: number }
