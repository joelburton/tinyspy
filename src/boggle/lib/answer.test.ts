// cs-fixed-outcome-fix

import { describe, it, expect } from 'vitest'
import { answerMessage, answerOf, peerAnswerMessage } from './answer'
import { makeTraceBoard } from './board'
import { ZTest_find, ZTest_makeGameDataRaw } from './gameData.fixture'
import { makeGameData } from '../hooks/useGame'

/**
 * Everything boggle says about a word, and how the engine's report becomes one
 * of its answers.
 *
 * The SQL half is `supabase/tests/boggle/`: `submit_word`'s `ok` carries no
 * outcome and no message, because the frontend says all of this.
 */
describe('answerMessage', () => {
  it('reads every answer', () => {
    expect(answerMessage({ answerType: 'accepted', word: 'apple', points: 2, bonus: false }))
      .toEqual({ outcome: 'won', text: 'APPLE — +2' })
    expect(answerMessage({ answerType: 'accepted', word: 'zesty', points: 2, bonus: true }))
      .toEqual({ outcome: 'won', text: 'ZESTY • — +2' })

    expect(answerMessage({ answerType: 'accepted_peer', word: 'apple', points: 2, bonus: false }))
      .toEqual({ outcome: 'won', text: 'found APPLE +2' })
    // Seven letters or more is the "wow" find.
    expect(answerMessage({ answerType: 'accepted_peer', word: 'jackpot', points: 9, bonus: false }))
      .toEqual({ outcome: 'won', text: 'wow! JACKPOT +9' })

    expect(answerMessage({ answerType: 'already_found', word: 'zesty', bonus: true }))
      .toEqual({ outcome: 'warning', text: 'ZESTY • — already found' })
    expect(answerMessage({ answerType: 'too_short', word: 'ab' }))
      .toEqual({ outcome: 'warning', text: 'AB — too short' })

    expect(answerMessage({ answerType: 'not_on_board', word: 'qqqq' }))
      .toEqual({ outcome: 'lost', text: 'QQQQ — not on board' })
    expect(answerMessage({ answerType: 'not_a_word', word: 'abe' }))
      .toEqual({ outcome: 'lost', text: 'ABE — not a word' })
  })
})

describe('answerOf', () => {
  // a b c d / e f g h / i j k l / m n o p
  const board = makeTraceBoard([...'abcdefghijklmnop'].map((l, i) => ({ id: String(i), letters: l })), 4)

  it('splits a miss by whether any path on the board spells it', () => {
    expect(answerOf({ answer: 'not_legal', word: 'abe' }, board).answerType).toBe('not_a_word')
    expect(answerOf({ answer: 'not_legal', word: 'apex' }, board).answerType).toBe('not_on_board')
  })

  it('carries the entry\'s points and bonus flag', () => {
    const entry = { word: 'fine', points: 1, pangram: false, bonus: true }
    expect(answerOf({ answer: 'accepted', word: 'fine', entry }, board))
      .toEqual({ answerType: 'accepted', word: 'fine', points: 1, bonus: true })
    expect(answerOf({ answer: 'already_found', word: 'fine', entry }, board))
      .toEqual({ answerType: 'already_found', word: 'fine', bonus: true })
    expect(answerOf({ answer: 'too_short', word: 'ab' }, board))
      .toEqual({ answerType: 'too_short', word: 'ab' })
  })
})

describe('peerAnswerMessage', () => {
  it('reads a teammate\'s find as the accepted_peer answer', () => {
    const gd = makeGameData(ZTest_makeGameDataRaw({ foundWords: [ZTest_find('u1', 'zesty', 2, { bonus: true })] }), 'u1')
    expect(peerAnswerMessage(gd.foundWords[0]!))
      .toEqual({ outcome: 'won', text: 'found ZESTY • +2' })
  })
})
