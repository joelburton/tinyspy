// cs-fixed-outcome-fix

import { describe, it, expect } from 'vitest'
import { answerMessage, eventToOutcome, peerAnswerOf } from './answer'

/**
 * letterboxed's answers: every one's outcome and words.
 *
 * The envelope half is pinned in pgTAP (`supabase/tests/letterboxed/
 * gameplay_test.sql`), which asserts that the move RPCs' envelopes carry NO
 * outcome and no sentence: how an answer reads is decided here alone.
 */
describe('answerMessage', () => {
  it('my word restates the words left; a cap-filling word, and a solve, say nothing', () => {
    expect(answerMessage({ answerType: 'accepted', word: 'adg', nWordsLeft: 3 }))
      .toEqual({ outcome: 'won', text: 'ADG — 3 words left' })
    expect(answerMessage({ answerType: 'accepted', word: 'adg', nWordsLeft: 1 }).text)
      .toBe('ADG — 1 word left')
    expect(answerMessage({ answerType: 'accepted', word: 'adg', nWordsLeft: 0 }))
      .toEqual({ outcome: 'won', text: '' })
    expect(answerMessage({ answerType: 'solved' })).toEqual({ outcome: 'won', text: '' })
  })

  it('a teammate\'s word names it and the board covered', () => {
    expect(answerMessage({ answerType: 'accepted_peer', word: 'gjb', nCoveredLetters: 5 }))
      .toEqual({ outcome: 'won', text: 'GJB (5/12)' })
  })

  it('an undo and a clear are news, not verdicts; a teammate\'s undo names the word', () => {
    expect(answerMessage({ answerType: 'undone' })).toEqual({ outcome: 'noted', text: '' })
    expect(answerMessage({ answerType: 'undone_peer', word: 'gjb' }))
      .toEqual({ outcome: 'noted', text: 'undid GJB' })
    expect(answerMessage({ answerType: 'cleared_peer' }))
      .toEqual({ outcome: 'noted', text: 'cleared the chain' })
  })

  it('a hint describes the word and is amber; a spoiler is the word and is red', () => {
    expect(answerMessage({ answerType: 'hint', word: 'adgjbehk' }))
      .toEqual({ outcome: 'warning', text: '8 letters starting with ADG' })
    expect(answerMessage({ answerType: 'hint_peer' })).toEqual({ outcome: 'warning', text: 'got a hint' })
    expect(answerMessage({ answerType: 'spoiler', word: 'kcfil' })).toEqual({ outcome: 'lost', text: 'KCFIL' })
    expect(answerMessage({ answerType: 'spoiler_peer' }))
      .toEqual({ outcome: 'lost', text: 'revealed a word' })
  })
})

describe('peerAnswerOf and eventToOutcome', () => {
  it('read a logged row by its kind', () => {
    expect(peerAnswerOf({ kind: 'word', word: 'adg', nCoveredLetters: 3 }))
      .toEqual({ answerType: 'accepted_peer', word: 'adg', nCoveredLetters: 3 })
    expect(peerAnswerOf({ kind: 'undo', word: 'adg', nCoveredLetters: 0 }))
      .toEqual({ answerType: 'undone_peer', word: 'adg' })
    expect([
      eventToOutcome({ kind: 'word', word: 'adg', nCoveredLetters: 3 }),
      eventToOutcome({ kind: 'undo', word: 'adg', nCoveredLetters: 0 }),
      eventToOutcome({ kind: 'clear', word: null, nCoveredLetters: 0 }),
      eventToOutcome({ kind: 'hint', word: 'adg', nCoveredLetters: 0 }),
      eventToOutcome({ kind: 'spoiler', word: 'adg', nCoveredLetters: 0 }),
    ]).toEqual(['won', 'noted', 'noted', 'warning', 'lost'])
  })
})
