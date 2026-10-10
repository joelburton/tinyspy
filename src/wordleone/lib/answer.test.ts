// cs-unmet

import { describe, it, expect } from 'vitest'
import type { GAnswer } from '../types'
import { answerMessage, eventToLabel, eventToOutcome, peerAnswerMessage } from './answer'

/**
 * wordleone's one presentation decision, both halves.
 *
 * `answerMessage` turns an answer into the words and the color every surface
 * shows; `eventToOutcome` and `peerAnswerMessage` are the two ways a logged row
 * asks it — the log wants the color alone, a teammate's header line wants the
 * peer words. The table walks every member of the union: the pill, the board's
 * refused mark, the log bar and the header line all read one function.
 *
 * The SQL half is pinned in `supabase/tests/wordleone/gameplay_test.sql`,
 * which asserts `submit_guess` answers with `data` and NO outcome or message.
 */
describe('answerMessage', () => {
  // Every member, with its color and its words — one table to read them from.
  // My own solve has no words: the green row that lands is the feedback.
  const CASES: [GAnswer, string, string][] = [
    [{ answerType: 'correct' }, 'won', ''],
    [{ answerType: 'correct_peer', guess: 'crane' }, 'won', 'guessed CRANE'],
    // Red: a miss is a wrong answer, and says nothing more.
    [{ answerType: 'miss' }, 'lost', "Doesn't fit"],
    [{ answerType: 'miss_peer', guess: 'crane' }, 'lost', "guessed CRANE — doesn't fit"],
    [{ answerType: 'solved_peer' }, 'won', 'solved it'],
    [{ answerType: 'duplicate' }, 'warning', 'Already guessed'],
    // Amber like the duplicate: refused, and free.
    [{ answerType: 'not_a_word' }, 'warning', 'Not in word list'],
    // A teammate's, now logged: the warning, since it costs nothing.
    [{ answerType: 'not_a_word_peer', guess: 'zzzzz' }, 'warning', 'tried ZZZZZ — not a word'],
    [{ answerType: 'too_short' }, 'warning', 'Not enough letters'],
  ]

  it.each(CASES)('%j reads %s: %s', (answer, outcome, text) => {
    expect(answerMessage(answer)).toEqual({ outcome, text })
  })

  it('has a case for every answer in the union', () => {
    // The union has no runtime form, so its membership is asserted against this
    // table: adding a member without a row here fails, and `answerMessage`'s
    // exhaustive switch fails to compile the other way round.
    const listed = new Set(CASES.map(([a]) => a.answerType))
    const all: GAnswer['answerType'][] = [
      'correct', 'correct_peer', 'miss', 'miss_peer', 'solved_peer',
      'duplicate', 'not_a_word', 'not_a_word_peer', 'too_short',
    ]
    expect([...listed].sort()).toEqual([...all].sort())
  })
})

describe('eventToOutcome and peerAnswerMessage', () => {
  it('reads a row as its outcome: the solve won, a miss lost, a logged non-word the warning its pill wore', () => {
    expect(eventToOutcome({ verdict: 'correct', word: 'verse' })).toBe('won')
    expect(eventToOutcome({ verdict: 'miss', word: 'crane' })).toBe('lost')
    expect(eventToOutcome({ verdict: 'not_a_word', word: 'zzzzz' })).toBe('warning')
    expect(eventToOutcome({ verdict: 'not_a_word', word: 'zzzzz' }))
      .toBe(answerMessage({ answerType: 'not_a_word' }).outcome)
  })

  it(`names the kind of wrong after a row: nothing for the solve, "doesn't fit" for a miss, "not word" for a non-word`, () => {
    expect(eventToLabel({ verdict: 'correct', word: 'verse' })).toBe('')
    expect(eventToLabel({ verdict: 'miss', word: 'crane' })).toBe("doesn't fit")
    expect(eventToLabel({ verdict: 'not_a_word', word: 'zzzzz' })).toBe('not word')
  })

  it('gives a peer row the twin words and the same color', () => {
    expect(peerAnswerMessage({ verdict: 'correct', word: 'verse' }))
      .toEqual({ outcome: 'won', text: 'guessed VERSE' })
    expect(peerAnswerMessage({ verdict: 'miss', word: 'slate' }))
      .toEqual({ outcome: 'lost', text: "guessed SLATE — doesn't fit" })
    expect(peerAnswerMessage({ verdict: 'not_a_word', word: 'zzzzz' }))
      .toEqual({ outcome: 'warning', text: 'tried ZZZZZ — not a word' })
  })
})
