// cs-fixed-outcome-fix

import type { AnswerMessage } from '@/common/feedback/FeedbackMessage'
import type { Outcome } from '@/common/outcomes/outcomes'
import type { GAnswer, GResult } from '../types'

/**
 * How an answer reads — **the one place this game decides that.** The pill and
 * the event log's bar both read it. An empty `text` means nothing is shown:
 * the answer's only job there is its outcome.
 *
 * The words speak the shared word-game format, `WORD — body`, word first and
 * in caps, which is how boggle, spellingbee and wordwheel write theirs; `too
 * short` and `not a word` are word for word boggle's.
 *
 * The readings, which are this game's rather than the vocabulary's:
 *
 *   - a **theme word** or the **spangram** is the goal: `won`.
 *   - a **hint word** is real progress — it moves the hint bar —
 *     but it is not the goal. `near` is exactly that. It says `hint earned`
 *     only when it filled the bar: the bar carries progress, and a line
 *     claiming a hint on every find would be wrong most of the time.
 *   - **already found** and **too short** are moves the rules turn away
 *     without anything happening: `warning`.
 *   - **not a word** is the one real miss, and it is red.
 *   - a **spent hint** is `warning`, as a hint is in every game: you asked for
 *     it and paid for it, and it is neither good nor bad play. It says
 *     nothing: the ring on the board is the news.
 */
export function answerMessage(answer: GAnswer): AnswerMessage {
  switch (answer.answerType) {
    case 'spangram':
      return { outcome: 'won', text: `${answer.word.toUpperCase()} — spangram` }
    case 'theme':
      return { outcome: 'won', text: `${answer.word.toUpperCase()} — theme` }
    case 'hint_word':
      return {
        outcome: 'near',
        text: `${answer.word.toUpperCase()} — ${answer.filledBar ? 'hint earned' : 'valid word'}`,
      }
    case 'duplicate':
      return { outcome: 'warning', text: `${answer.word.toUpperCase()} — already found` }
    case 'too_short':
      return { outcome: 'warning', text: `${answer.word.toUpperCase()} — too short` }
    case 'invalid':
      return { outcome: 'lost', text: `${answer.word.toUpperCase()} — not a word` }
    case 'hint':
      return { outcome: 'warning', text: '' }
  }
}

/** The columns of a log row that say what it WAS: a guess's word and verdict,
 *  or a hint, which has neither. */
type LoggedEvent =
  | { kind: 'guess'; word: string; result: GResult }
  | { kind: 'hint'; word: null; result: null }

/**
 * Which answer a logged row is. A hint row has no `result`, so `kind` is read
 * first; a row does not record whether a hint word filled the bar, and the log
 * reads only its outcome.
 */
export function answerOf(row: LoggedEvent): GAnswer {
  if (row.kind === 'hint') return { answerType: 'hint' }
  if (row.result === 'hint_word') return { answerType: 'hint_word', word: row.word, filledBar: false }
  return { answerType: row.result, word: row.word }
}

/** What COLOR a logged row is — for the event log, which writes its own words. */
export function eventToOutcome(row: LoggedEvent): Outcome {
  return answerMessage(answerOf(row)).outcome
}
