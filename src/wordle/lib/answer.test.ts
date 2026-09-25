// cs-blessed-wordle

import { describe, it, expect } from 'vitest'
import { answerMessage, eventToOutcome, peerAnswerMessage, type Answer } from './answer'

/**
 * wordle's one presentation decision, both halves.
 *
 * `answerMessage` turns an answer into the words and the color every surface
 * shows; `eventToOutcome` and `peerAnswerMessage` are the two ways a logged row
 * asks it — the log wants the color alone, a teammate's header line wants the
 * peer words. The table in the middle walks every member of the union, which
 * is the point of the file: the pill, the board's refused mark, the log bar and
 * the header line all read one function, so a word or a color changed here
 * changes in all of them — and a new answer nobody gave words to is a compile
 * error in `answerMessage` rather than a blank pill.
 *
 * The SQL half is pinned in `supabase/tests/wordle/gameplay_test.sql`, which
 * asserts `submit_guess` answers with `data` and NO outcome or message — the
 * other half of this arrangement.
 */
describe('answerMessage', () => {
  // Every member, with its color and its words — one table to read them from.
  // My own accepted guess has no words: the colored row that lands is the
  // feedback, and the answer's job is its outcome, for the log's bar.
  const CASES: [Answer, string, string][] = [
    [{ answerType: 'correct' }, 'won', ''],
    [{ answerType: 'correct_peer', guess: 'crane' }, 'won', 'guessed CRANE'],
    [{ answerType: 'incorrect' }, 'neutral', ''],
    [{ answerType: 'incorrect_peer', guess: 'crane' }, 'neutral', 'guessed CRANE'],
    [{ answerType: 'solved_peer' }, 'won', 'solved it'],
    [{ answerType: 'duplicate' }, 'warning', 'Already guessed'],
    // Red on purpose, beside the amber duplicate — the reason is in answer.ts.
    [{ answerType: 'not_a_word' }, 'lost', 'Not in word list'],
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
    const all: Answer['answerType'][] = [
      'correct', 'correct_peer', 'incorrect', 'incorrect_peer', 'solved_peer',
      'duplicate', 'not_a_word', 'too_short',
    ]
    expect([...listed].sort()).toEqual([...all].sort())
  })
})

// The two ways a logged row asks: `is_correct` read as my own answer for the
// color, and as the peer twin for the header line.
describe('eventToOutcome and peerAnswerMessage', () => {
  it('reads a row as its outcome', () => {
    expect(eventToOutcome({ is_correct: true, word: 'crane' })).toBe('won')
    expect(eventToOutcome({ is_correct: false, word: 'crane' })).toBe('neutral')
  })

  it('gives a peer row the twin words and the same color', () => {
    expect(peerAnswerMessage({ is_correct: true, word: 'crane' }))
      .toEqual({ outcome: 'won', text: 'guessed CRANE' })
    expect(peerAnswerMessage({ is_correct: false, word: 'slate' }))
      .toEqual({ outcome: 'neutral', text: 'guessed SLATE' })
  })
})
