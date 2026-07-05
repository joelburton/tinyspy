import { describe, it, expect } from 'vitest'
import { timerLabel } from './timerLabel'

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
