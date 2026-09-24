// cs-met-wordwheel

import { describe, it, expect } from 'vitest'
import { answerMessage, answerOf, peerAnswerMessage } from './answer'

/**
 * Everything wordwheel says about a word, and how the engine's report becomes
 * one of its answers. The words are `PlayArea.test.tsx`'s wheel: outer `cabdfghi`,
 * center `e`.
 *
 * The SQL half is `supabase/tests/wordwheel/`: `submit_word`'s `ok` carries no
 * outcome and no message, because the frontend says all of this.
 */
describe('answerMessage', () => {
  it('reads every answer', () => {
    const word = { points: 1, isBonus: false, isPangram: false }
    expect(answerMessage({ answerType: 'accepted', word: 'bead', ...word }))
      .toEqual({ outcome: 'won', text: 'BEAD — +1' })
    expect(answerMessage({ answerType: 'accepted', word: 'bcdfge', ...word, points: 6, isBonus: true }))
      .toEqual({ outcome: 'won', text: 'BCDFGE • — +6' })
    expect(answerMessage({ answerType: 'accepted', word: 'abcdefg', ...word, points: 17, isPangram: true }))
      .toEqual({ outcome: 'won', text: 'ABCDEFG — pangram +17' })

    expect(answerMessage({ answerType: 'accepted_peer', word: 'bead', ...word }))
      .toEqual({ outcome: 'won', text: 'found BEAD +1' })
    expect(answerMessage({ answerType: 'accepted_peer', word: 'abcdefg', ...word, points: 17, isPangram: true }))
      .toEqual({ outcome: 'won', text: 'pangram 🦌 ABCDEFG +17' })

    expect(answerMessage({ answerType: 'already_found', word: 'bcdfge', isBonus: true }))
      .toEqual({ outcome: 'warning', text: 'BCDFGE • — already found' })
    expect(answerMessage({ answerType: 'too_short', word: 'bed' }))
      .toEqual({ outcome: 'warning', text: 'BED — too short' })

    expect(answerMessage({ answerType: 'missing_center', word: 'cabs', center: 'e' }))
      .toEqual({ outcome: 'lost', text: 'CABS — missing "E"' })
    expect(answerMessage({ answerType: 'not_a_word', word: 'dace' }))
      .toEqual({ outcome: 'lost', text: 'DACE — not a word' })

    expect(answerMessage({ answerType: 'reached_peer', rank: 'Amazing' }))
      .toEqual({ outcome: 'noted', text: 'reached Amazing' })
  })
})

describe('answerOf', () => {
  it('splits a miss by the center letter', () => {
    expect(answerOf({ answer: 'not_legal', word: 'cabs' }, 'e'))
      .toEqual({ answerType: 'missing_center', word: 'cabs', center: 'e' })
    expect(answerOf({ answer: 'not_legal', word: 'dace' }, 'e').answerType).toBe('not_a_word')
  })

  it('carries the entry\'s points and flags', () => {
    const entry = { word: 'abcdefg', points: 17, isBonus: false, isPangram: true }
    expect(answerOf({ answer: 'accepted', word: 'abcdefg', entry }, 'e'))
      .toEqual({ answerType: 'accepted', word: 'abcdefg', points: 17, isBonus: false, isPangram: true })
    expect(answerOf({ answer: 'already_found', word: 'abcdefg', entry: null }, 'e'))
      .toEqual({ answerType: 'already_found', word: 'abcdefg', isBonus: false })
    expect(answerOf({ answer: 'too_short', word: 'bed' }, 'e'))
      .toEqual({ answerType: 'too_short', word: 'bed' })
  })
})

describe('peerAnswerMessage', () => {
  it('reads a teammate\'s row as the accepted_peer answer', () => {
    expect(peerAnswerMessage({ word: 'bcdfge', points: 6, is_bonus: true }))
      .toEqual({ outcome: 'won', text: 'found BCDFGE • +6' })
  })
})
