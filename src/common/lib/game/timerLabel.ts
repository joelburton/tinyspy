// cs-audited-game-lib

import type { TimerMode } from '../gameManifest'

/**
 * The VALUE of a game's CONFIGURED timer — `none`, `count-up`, or
 * `2:30 countdown`.
 *
 * **It is always printed after a "Timer:" label, never alone**, which is why
 * `none` reads as it does rather than "no timer". Two places print it, and both
 * supply that label themselves:
 *
 *  - `setupRows.ts`'s `timerRow()`, for the setup recap — the info column and
 *    the PDF then render the row like any other.
 *  - `<SetupTimerSection>`, for its own section heading while you are still
 *    choosing. So the string you pick by is the string the recap shows you
 *    later, which is the point of formatting in one place.
 *
 * Extracted because every timer-bearing PlayArea held a byte-identical copy of
 * this formatter (several even commented that they were copies).
 */
export function timerLabel(t: TimerMode): string {
  if (t.kind === 'countup') return 'count-up'
  if (t.kind === 'countdown') {
    const m = Math.floor(t.seconds / 60)
    const s = t.seconds % 60
    return `${m}:${String(s).padStart(2, '0')} countdown`
  }
  return 'none'
}
