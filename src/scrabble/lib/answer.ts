// cs-fixed-outcome-fix

import type { AnswerMessage } from '@/common/feedback/FeedbackMessage'
import type { Outcome } from '@/common/outcomes/outcomes'
import { RACK_SIZE } from './board'
import type { GAnswer, GEvent } from '../types'

/**
 * How an answer reads — **the one place this game decides that.** The pill,
 * the header's opponent line and the event log's bar all read it. An empty
 * `text` means nothing is shown: the answer's only job there is its outcome.
 *
 * The readings, which are this game's rather than the vocabulary's:
 *
 *   - a **word** is the move this game is made of, and it scores: `won`.
 *   - the dictionary turning a word down is the move going wrong: `lost`.
 *   - an **exchange** is not a score. Swapping tiles is buying a better rack
 *     at the cost of a turn, and whether it pays off shows up two moves later
 *     — a turn that counted and that nothing adjudicates: `neutral`. Calling
 *     it `won` would make trading tiles read like scoring.
 *   - a **pass** is the same shape with nothing bought. My own has no pill:
 *     the turn handing on is the answer.
 *   - **leftovers** and **went_out** are the rows an ending writes for the
 *     racks — the arithmetic of the end, not a judgment: `neutral`, and the
 *     number in the row says what it cost or earned.
 *
 * Most of them `neutral` is the honest shape: scrabble adjudicates the PLAY
 * and lets the score carry everything else. Words are stored lowercase and
 * capitalized here, since a sentence is where CSS cannot reach.
 */
export function answerMessage(answer: GAnswer): AnswerMessage {
  switch (answer.answerType) {
    case 'word': {
      const words = answer.words.map((w) => w.toUpperCase()).join(' · ')
      return {
        outcome: 'won',
        text: `${words} +${answer.score}${answer.bingo ? ' 🎉' : ''}`,
      }
    }
    case 'word_peer':
      return {
        outcome: 'won',
        text: `played ${answer.words[0].toUpperCase()} (+${answer.score})`,
      }
    case 'invalid':
      return {
        outcome: 'lost',
        text: `No: ${answer.badWords.join(', ').toUpperCase()}`,
      }
    case 'exchange':
      return { outcome: 'neutral', text: `Swapped ${answer.nTiles}` }
    case 'exchange_peer':
      return { outcome: 'neutral', text: `exchanged ${answer.nTiles} tiles` }
    case 'pass':
      return { outcome: 'neutral', text: '' }
    case 'pass_peer':
      return { outcome: 'neutral', text: 'passed' }
    case 'leftovers':
      return { outcome: 'neutral', text: '' }
    case 'went_out':
      return { outcome: 'neutral', text: '' }
  }
}

/** A logged row as the answer it was. The log reads every row the same,
 *  whoever played it. */
export function answerOfEvent(event: GEvent): GAnswer {
  switch (event.kind) {
    case 'word':
      // `_commit_word` writes a word row only when it accepts, with its words,
      // score and placements. A bingo is a full rack laid.
      return {
        answerType: 'word',
        words: event.words!,
        score: event.score!,
        bingo: event.placements!.length === RACK_SIZE,
      }
    case 'exchange':
      return { answerType: 'exchange', nTiles: event.nTiles! }
    case 'pass':
      return { answerType: 'pass' }
    case 'leftovers':
      return { answerType: 'leftovers' }
    case 'went_out':
      return { answerType: 'went_out' }
  }
}

/** What COLOR a logged row is — for the event log, which writes its own
 *  words. */
export function eventToOutcome(event: GEvent): Outcome {
  return answerMessage(answerOfEvent(event)).outcome
}
