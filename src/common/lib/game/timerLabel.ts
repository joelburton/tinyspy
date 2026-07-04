import type { TimerMode } from '../games'

/**
 * Human-readable label for a game's CONFIGURED timer — e.g. `2:30 countdown`,
 * `count-up timer`, `no timer`.
 *
 * This is the read-only DISPLAY of an already-chosen timer, rendered in the
 * during-game "Setup options" recap (`<li>{timerLabel(setup.timer)}</li>`) in
 * every gametype's PlayArea. The timer CHOOSER is a separate component,
 * `<TimerField>`; this just formats what it produced.
 *
 * Shared because all 9 timer-bearing PlayAreas held a byte-identical copy of
 * this formatter (several even commented that they were copies).
 */
export function timerLabel(t: TimerMode): string {
  if (t.kind === 'countup') return 'count-up timer'
  if (t.kind === 'countdown') {
    const m = Math.floor(t.seconds / 60)
    const s = t.seconds % 60
    return `${m}:${String(s).padStart(2, '0')} countdown`
  }
  return 'no timer'
}
