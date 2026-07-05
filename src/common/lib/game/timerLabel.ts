import type { TimerMode } from '../games'

/**
 * The VALUE of a game's CONFIGURED timer, for the `Timer: …` row of the
 * during-game "Setup options" recap — `none`, `count-up`, or `2:30 countdown`.
 * Every gametype renders it as `<li>Timer: {timerLabel(setup.timer)}</li>`, so
 * the value stands alone after the "Timer:" label (hence `none`, not `no
 * timer`). The timer CHOOSER is a separate component, `<TimerField>`; this just
 * formats what it produced.
 *
 * Shared because all 9 timer-bearing PlayAreas held a byte-identical copy of
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
