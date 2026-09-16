// cs-met-timer

import type { TimerMode } from '../manifest/gameManifest'

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
 */
export function timerLabel(t: TimerMode): string {
  if (t.kind === 'countup') return 'count-up'
  if (t.kind === 'countdown') return `${formatTimerSeconds(t.seconds)} countdown`
  return 'none'
}

/**
 * A number of seconds as "M:SS" — the running clock in `GamePage`'s header
 * whichever way it counts, the countdown length in the setup box, and the
 * countdown arm of `timerLabel` above.
 */
export function formatTimerSeconds(seconds: number): string {
  const m = Math.floor(seconds / 60)
  const s = seconds % 60
  return `${m}:${s.toString().padStart(2, '0')}`
}
