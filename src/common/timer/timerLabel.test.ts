// cs-blessed-timer

import { describe, it, expect } from 'vitest'
import { formatTimerSeconds, timerLabel } from './timerLabel'

/**
 * How a configured timer reads once it is printed — `none`, `count-up`, or
 * `2:30 countdown` — and the M:SS both it and the header's clock are formatted
 * in.
 *
 * Most of these just pin the arms of `TimerMode`. **The one worth having is
 * `0:05`**: a seconds field under ten is where an unpadded one would show, and
 * `padStart(2, '0')` is exactly the sort of line that looks like it could go.
 * Nothing but a game would catch `2:5`, and a game would — ten seconds out of
 * every minute in the header. The padding is asserted twice on purpose —
 * through `formatTimerSeconds` directly and through the `countdown` arm that
 * calls it — so a label that stopped sharing the formatter fails here rather
 * than drifting.
 *
 * Asserting `'none'` is likewise not a restatement of the code. The value is
 * always printed after a "Timer:" label — by `setupRows.ts`'s `timerRow()` for
 * the recap, and by `<SetupTimerSection>` for its own heading while you choose
 * — so it has to read as the answer to that label rather than stand alone. That
 * is why the string is `none` and not `no timer`.
 */
describe('timerLabel', () => {
  it('labels no timer', () => {
    expect(timerLabel({ kind: 'none' })).toBe('none')
  })

  it('labels a count-up timer', () => {
    expect(timerLabel({ kind: 'countup' })).toBe('count-up')
  })

  it('formats a countdown as m:ss with a zero-padded seconds field', () => {
    expect(timerLabel({ kind: 'countdown', seconds: 150 })).toBe('2:30 countdown')
    expect(timerLabel({ kind: 'countdown', seconds: 65 })).toBe('1:05 countdown')
    expect(timerLabel({ kind: 'countdown', seconds: 5 })).toBe('0:05 countdown')
    expect(timerLabel({ kind: 'countdown', seconds: 600 })).toBe('10:00 countdown')
  })
})

describe('formatTimerSeconds', () => {
  it('formats as M:SS with zero-padded seconds', () => {
    expect(formatTimerSeconds(0)).toBe('0:00')
    expect(formatTimerSeconds(9)).toBe('0:09')
    expect(formatTimerSeconds(60)).toBe('1:00')
    expect(formatTimerSeconds(125)).toBe('2:05')
    expect(formatTimerSeconds(600)).toBe('10:00')
  })
})
