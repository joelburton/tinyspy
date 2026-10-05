// cs-fixed-outcome-fix

import type { AnswerMessage } from '@/common/feedback/FeedbackMessage'
import type { Outcome } from '@/common/outcomes/outcomes'
import { BOARD_SIZE } from './board'
import { hintPrefix } from './hintOrSpoiler'
import type { GAnswer, GEvent } from '../types'

/**
 * How an answer reads — **the one place this game decides that.** The pill, a
 * teammate's header line, the content echoed into my slot and the event log's
 * bar all read it. An empty `text` means nothing is shown: the answer's only
 * job there is its outcome.
 *
 * The readings, which are this game's rather than the vocabulary's:
 *
 *   - **a played word is `won`.** Getting a legal word onto this board is the
 *     achievement here: it has to be a real word, fit the twelve letters, cross
 *     a side at every step AND start on the letter the last word left you.
 *     Unlike a wordle guess — one of six tries, usually wrong — landing one is
 *     unambiguously progress.
 *   - **undo and clear are `noted`, not `neutral`.** They are information: the
 *     chain is shorter than it was, and the player who did it is telling the
 *     table so. Blue is the vocabulary's word for news that is not a verdict.
 *     Not `neutral`: in turn-by-turn coop an undo does cost the undoer their
 *     turn, which is why neither is red, but that is not a reason to call news
 *     nothing.
 *   - a hint names a word's length and opening letters, which leaves you
 *     something to find: `warning`, as a hint is in every game.
 *   - a spoiler IS the word. There is nothing left to find, so it is red.
 */
export function answerMessage(answer: GAnswer): AnswerMessage {
  switch (answer.answerType) {
    case 'accepted': {
      const n = answer.nWordsLeft
      return {
        outcome: 'won',
        text: n === 0 ? '' : `${answer.word.toUpperCase()} — ${n} ${n === 1 ? 'word' : 'words'} left`,
      }
    }
    case 'accepted_peer':
      return {
        outcome: 'won',
        text: `${answer.word.toUpperCase()} (${answer.nCoveredLetters}/${BOARD_SIZE})`,
      }
    case 'solved':
      return { outcome: 'won', text: '' }

    case 'undone':
      return { outcome: 'noted', text: '' }
    // Named, not "the last word": the team's board just lost it, so say WHICH
    // word came off (the log's "took back GJB" agrees).
    case 'undone_peer':
      return { outcome: 'noted', text: `undid ${answer.word.toUpperCase()}` }
    case 'cleared_peer':
      return { outcome: 'noted', text: 'cleared the chain' }

    // The hint DESCRIBES the word, the spoiler IS it.
    case 'hint':
      return {
        outcome: 'warning',
        text: `${answer.word.length} letters starting with ${hintPrefix(answer.word)}`,
      }
    case 'hint_peer':
      return { outcome: 'warning', text: 'got a hint' }
    case 'spoiler':
      return { outcome: 'lost', text: answer.word.toUpperCase() }
    case 'spoiler_peer':
      return { outcome: 'lost', text: 'revealed a word' }
  }
}

/** The columns of a log row that say what it WAS. */
type LoggedEvent = Pick<GEvent, 'kind' | 'word' | 'nCoveredLetters'>

/** What COLOR a logged row is — for the event log, which writes its own words. */
export function eventToOutcome(row: LoggedEvent): Outcome {
  return answerMessage(peerAnswerOf(row)).outcome
}

/**
 * Which answer a logged row is when it is a TEAMMATE's — the caller has
 * already established that it is not the viewer's own. Every word, undo, hint
 * and spoiler row names its word.
 */
export function peerAnswerOf(row: LoggedEvent): GAnswer {
  switch (row.kind) {
    case 'word':
      return { answerType: 'accepted_peer', word: row.word!, nCoveredLetters: row.nCoveredLetters }
    case 'undo':
      return { answerType: 'undone_peer', word: row.word! }
    case 'clear':
      return { answerType: 'cleared_peer' }
    case 'hint':
      return { answerType: 'hint_peer' }
    case 'spoiler':
      return { answerType: 'spoiler_peer' }
  }
}
