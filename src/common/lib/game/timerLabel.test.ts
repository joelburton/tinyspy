// cs-audited-game-lib

import { describe, it, expect } from 'vitest'
import { timerLabel } from './timerLabel'

/**
 * How a configured timer reads once it is printed — `none`, `count-up`, or
 * `2:30 countdown`.
 *
 * Three of the four cases just pin the three arms of `TimerMode`. **The one
 * worth having is `0:05`**: a countdown under a minute is where an unpadded
 * seconds field would show, and `padStart(2, '0')` is exactly the sort of line
 * that looks like it could go. Nobody would catch `0:5` until a game was played
 * on a short countdown and its recap printed.
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
