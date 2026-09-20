// cs-blessed-connections

import type { Outcome } from '@/common/outcomes/outcomes'
import type { AnswerMessage } from '@/common/feedback/FeedbackMessage'

/**
 * What a 4-tile guess was — the three values `connections.events.result`
 * stores.
 *
 * Unusually for this roster, the FRONTEND decides which one a guess is: the
 * board is publicly readable, so `evaluateGuess` adjudicates locally and sends
 * the verdict up (the FE-knows decision, doc.md → Intro). The column, the RPC's
 * `result` argument and this type are the same three facts.
 */
export type GuessResult = 'correct' | 'oneAway' | 'wrong'

/**
 * Everything that can be SAID about a move in this game, as a closed set — and
 * **read as a list, it is the whole roster of what this game tells anybody.**
 *
 * "_peer" versions are answers that come from subscriptions and are for peer
 * feedback.
 */
export type Answer =
  // My guess matched a category.
  | { answerType: 'correct' }
  // A coop teammate's did, on the board we share.
  | { answerType: 'correct_peer' }

  // Three of my four were in one category.
  | { answerType: 'one_away' }
  // Three of a coop teammate's four were.
  | { answerType: 'one_away_peer' }

  // My guess matched nothing.
  | { answerType: 'wrong' }
  // A coop teammate's matched nothing.
  | { answerType: 'wrong_peer' }

  // Refused here: this set of four was already tried.
  | { answerType: 'already_tried' }

/**
 * How an answer reads — **the one place this game decides that.** A pair
 * shares its words: a teammate's line is "● moth" and then the same text.
 */
export function answerMessage(answer: Answer): AnswerMessage {
  switch (answer.answerType) {
    case 'correct':
    case 'correct_peer':
      return { outcome: 'won', text: 'Correct' }

    case 'one_away':
    case 'one_away_peer':
      return { outcome: 'near', text: 'One away!' }

    case 'wrong':
    case 'wrong_peer':
      return { outcome: 'lost', text: 'Wrong' }

    case 'already_tried':
      return { outcome: 'warning', text: 'You already tried that' }
  }
}

/** The column of a `connections.events` row that says what it WAS. Narrower
 *  than `EventRow` on purpose: nothing here may reach for an author, an id or
 *  the tiles, which belong to the surface drawing the row. */
type LoggedGuess = { result: GuessResult }

/**
 * What COLOR a logged row is — for the event log, the history banner and the
 * printer, which write their own words.
 */
export function eventToOutcome(row: LoggedGuess): Outcome {
  return answerMessage({ answerType: mine(row.result) }).outcome
}

/**
 * How a logged row reads when it is SOMEBODY ELSE'S — the `_peer` twin of
 * whatever it was, with the words that go in the header line.
 *
 * The caller has already established that the row is not the viewer's own (its
 * own line is the local slot's).
 */
export function peerAnswerMessage(row: LoggedGuess): AnswerMessage {
  return answerMessage({ answerType: `${mine(row.result)}_peer` })
}

// The wire word as my own answer; the peer twin is the same name suffixed.
function mine(result: GuessResult): 'correct' | 'one_away' | 'wrong' {
  return result === 'oneAway' ? 'one_away' : result
}
