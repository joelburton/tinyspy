// cs-blessed-spellingbee

import { describe, it, expect } from 'vitest'
import type { FoundWordsWord } from '@/shared/found-words/foundWords'
import { answerMessage, answerOf, peerAnswerMessage } from './answer'

/**
 * Everything spellingbee says about a word, and how the engine's report becomes
 * one of its answers. The words are a real board's — `A·CHIORT`, the one
 * `doc.md` uses.
 *
 * The SQL half is `gameplay_test.sql`, which pins that `submit_word`'s `ok`
 * carries no outcome and no message: the frontend says all of this.
 */
describe('answerMessage', () => {
  it('reads every answer', () => {
    const word = { points: 1, bonus: false, pangram: false }
    expect(answerMessage({ answerType: 'accepted', word: 'chat', ...word }))
      .toEqual({ outcome: 'won', text: 'CHAT — +1' })
    expect(answerMessage({ answerType: 'accepted', word: 'airt', ...word, bonus: true }))
      .toEqual({ outcome: 'won', text: 'AIRT • — +1' })
    expect(answerMessage({ answerType: 'accepted', word: 'chariot', ...word, points: 17, pangram: true }))
      .toEqual({ outcome: 'won', text: 'CHARIOT — pangram +17' })

    expect(answerMessage({ answerType: 'accepted_peer', word: 'chat', ...word }))
      .toEqual({ outcome: 'won', text: 'found CHAT +1' })
    expect(answerMessage({ answerType: 'accepted_peer', word: 'chariot', ...word, points: 17, pangram: true }))
      .toEqual({ outcome: 'won', text: 'pangram 🐝 CHARIOT +17' })

    expect(answerMessage({ answerType: 'already_found', word: 'airt', bonus: true }))
      .toEqual({ outcome: 'warning', text: 'AIRT • — already found' })
    expect(answerMessage({ answerType: 'too_short', word: 'cat' }))
      .toEqual({ outcome: 'warning', text: 'CAT — too short' })

    expect(answerMessage({ answerType: 'bad_letters', word: 'caxt' }))
      .toEqual({ outcome: 'lost', text: 'CAXT — bad letters' })
    expect(answerMessage({ answerType: 'missing_center', word: 'chit', center: 'a' }))
      .toEqual({ outcome: 'lost', text: 'CHIT — missing "A"' })
    expect(answerMessage({ answerType: 'not_a_word', word: 'chait' }))
      .toEqual({ outcome: 'lost', text: 'CHAIT — not a word' })

    expect(answerMessage({ answerType: 'reached_peer', rank: 'Amazing' }))
      .toEqual({ outcome: 'noted', text: 'reached Amazing' })
  })
})

describe('answerOf', () => {
  const board = { letters: new Set('achiort'), center: 'a' }
  const AIRT: FoundWordsWord = { word: 'airt', points: 1, pangram: false, bonus: true }

  it('splits a miss by why: a letter off the board, then the center, then not a word', () => {
    expect(answerOf({ answer: 'not_legal', word: 'caxt' }, board).answerType).toBe('bad_letters')
    expect(answerOf({ answer: 'not_legal', word: 'chit' }, board))
      .toEqual({ answerType: 'missing_center', word: 'chit', center: 'a' })
    expect(answerOf({ answer: 'not_legal', word: 'chait' }, board).answerType).toBe('not_a_word')
    // A letter off the board wins over the missing center — it is the first thing wrong.
    expect(answerOf({ answer: 'not_legal', word: 'xhit' }, board).answerType).toBe('bad_letters')
  })

  it('carries the entry\'s points and flags', () => {
    expect(answerOf({ answer: 'accepted', word: 'airt', entry: AIRT }, board))
      .toEqual({ answerType: 'accepted', word: 'airt', points: 1, bonus: true, pangram: false })
    expect(answerOf({ answer: 'already_found', word: 'airt', entry: AIRT }, board))
      .toEqual({ answerType: 'already_found', word: 'airt', bonus: true })
    expect(answerOf({ answer: 'already_found', word: 'airt', entry: null }, board))
      .toEqual({ answerType: 'already_found', word: 'airt', bonus: false })
    expect(answerOf({ answer: 'too_short', word: 'cat' }, board))
      .toEqual({ answerType: 'too_short', word: 'cat' })
  })
})

describe('peerAnswerMessage', () => {
  it('reads a teammate\'s row as the accepted_peer answer', () => {
    expect(peerAnswerMessage({ word: 'airt', points: 1, bonus: true, pangram: false }))
      .toEqual({ outcome: 'won', text: 'found AIRT • +1' })
  })
})
