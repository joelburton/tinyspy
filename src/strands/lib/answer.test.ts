// cs-fixed-outcome-fix

import { describe, it, expect } from 'vitest'
import { answerMessage, answerOf, eventToOutcome } from './answer'

/**
 * strands' one outcome decision, and its words. The move RPCs answer the case
 * alone (`gameplay_test.sql` pins the null outcome), so this is the only place
 * the readings are pinned.
 */
describe('answerMessage', () => {
  it('a find is the goal: won, in the shared WORD — body format', () => {
    expect(answerMessage({ answerType: 'theme', word: 'medicine' }))
      .toEqual({ outcome: 'won', text: 'MEDICINE — theme' })
    expect(answerMessage({ answerType: 'spangram', word: 'pharmacy' }))
      .toEqual({ outcome: 'won', text: 'PHARMACY — spangram' })
  })

  it('a hint word is near, and says a hint only when it filled the bar', () => {
    expect(answerMessage({ answerType: 'hint_word', word: 'trailer', filledBar: false }))
      .toEqual({ outcome: 'near', text: 'TRAILER — valid word' })
    expect(answerMessage({ answerType: 'hint_word', word: 'trailer', filledBar: true }))
      .toEqual({ outcome: 'near', text: 'TRAILER — hint earned' })
  })

  it('the moves the rules turn away are warnings; not a word is the one red', () => {
    expect(answerMessage({ answerType: 'duplicate', word: 'tryst' }))
      .toEqual({ outcome: 'warning', text: 'TRYST — already found' })
    expect(answerMessage({ answerType: 'too_short', word: 'ate' }))
      .toEqual({ outcome: 'warning', text: 'ATE — too short' })
    expect(answerMessage({ answerType: 'invalid', word: 'zzqf' }))
      .toEqual({ outcome: 'lost', text: 'ZZQF — not a word' })
  })

  it('a spent hint is a warning that says nothing', () => {
    expect(answerMessage({ answerType: 'hint' })).toEqual({ outcome: 'warning', text: '' })
  })
})

describe('a logged row', () => {
  it('a hint row is a hint, read by its kind', () => {
    expect(answerOf({ kind: 'hint', word: null, result: null })).toEqual({ answerType: 'hint' })
    expect(eventToOutcome({ kind: 'hint', word: null, result: null })).toBe('warning')
  })

  it('a guess row wears its result\'s outcome', () => {
    expect(eventToOutcome({ kind: 'guess', word: 'zzqabc', result: 'theme' })).toBe('won')
    expect(eventToOutcome({ kind: 'guess', word: 'zzqb', result: 'hint_word' })).toBe('near')
    expect(eventToOutcome({ kind: 'guess', word: 'zzqb', result: 'duplicate' })).toBe('warning')
    expect(eventToOutcome({ kind: 'guess', word: 'zzqf', result: 'invalid' })).toBe('lost')
  })
})
