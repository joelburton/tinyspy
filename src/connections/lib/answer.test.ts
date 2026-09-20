// cs-blessed-connections

import { describe, it, expect } from 'vitest'
import { answerMessage, eventToOutcome, peerAnswerMessage, type Answer } from './answer'

/**
 * connections' one presentation decision, both halves.
 *
 * `answerMessage` turns an answer into the words and the color every surface
 * shows; `eventToOutcome` and `peerAnswerMessage` are the two ways a logged row
 * asks it — the log wants the color alone, a teammate's header line wants the
 * peer words. The table in the middle walks every member of the union, which
 * is the point of the file: the pill, the log bar and the header line all read
 * one function, so a word or a color changed here changes in all three — and a
 * new answer nobody gave words to is a compile error in `answerMessage` rather
 * than a blank pill.
 *
 * The SQL half is pinned in `supabase/tests/connections/gameplay_test.sql`,
 * which asserts `submit_guess` answers with `data` and NO outcome — the other
 * half of this arrangement.
 */
describe('answerMessage', () => {
  // Every member, with its color and its words — one table to read them from,
  // which is what the three surfaces now agree about. A pair shares its words:
  // a teammate's line is their name and then the same text.
  const CASES: [Answer, string, string][] = [
    [{ answerType: 'correct' }, 'won', 'Correct'],
    [{ answerType: 'correct_peer' }, 'won', 'Correct'],
    [{ answerType: 'one_away' }, 'near', 'One away!'],
    [{ answerType: 'one_away_peer' }, 'near', 'One away!'],
    [{ answerType: 'wrong' }, 'lost', 'Wrong'],
    [{ answerType: 'wrong_peer' }, 'lost', 'Wrong'],
    [{ answerType: 'already_tried' }, 'warning', 'You already tried that'],
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
      'correct', 'correct_peer', 'one_away', 'one_away_peer', 'wrong', 'wrong_peer', 'already_tried',
    ]
    expect([...listed].sort()).toEqual([...all].sort())
  })
})

// The two ways a logged row asks: the wire word the column stores, read as my
// own answer for the color, and as the peer twin for the header line.
describe('eventToOutcome and peerAnswerMessage', () => {
  it('reads each wire word as its outcome', () => {
    expect(eventToOutcome({ result: 'correct' })).toBe('won')
    expect(eventToOutcome({ result: 'oneAway' })).toBe('near')
    expect(eventToOutcome({ result: 'wrong' })).toBe('lost')
  })

  it('gives a peer row the twin words and the same color', () => {
    expect(peerAnswerMessage({ result: 'correct' })).toEqual({ outcome: 'won', text: 'Correct' })
    expect(peerAnswerMessage({ result: 'oneAway' })).toEqual({ outcome: 'near', text: 'One away!' })
    expect(peerAnswerMessage({ result: 'wrong' })).toEqual({ outcome: 'lost', text: 'Wrong' })
  })
})
