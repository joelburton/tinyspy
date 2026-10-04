// cs-fixed-outcome-fix

import type { AnswerMessage } from '@/common/feedback/FeedbackMessage'
import { type WordSubmitReport } from '@/shared/found-words/useFoundWordSubmit'
import { wordWithBonusBullet } from '@/shared/found-words/foundWords'
import { traceableStr } from './boardTrace'
import type { GAnswer } from '../types'

/**
 * How an answer reads — **the one place this game decides that.** The pill,
 * the tiles a refused word used, and the header's peer line all read it.
 *
 * The readings, which are this game's rather than the vocabulary's: the board
 * is in front of you and the list is the ordinary English one, so a word that
 * does not count is a WRONG MOVE (`lost`), whichever way it missed. Too short
 * and already found are not — you have not finished typing, or you already
 * have it — so they are `warning`.
 */
export function answerMessage(answer: GAnswer): AnswerMessage {
  switch (answer.answerType) {
    case 'accepted':
      return { outcome: 'won', text: `${wordWithBonusBullet(answer.word, answer.isBonus)} — +${answer.points}` }
    // A long find (7+ letters) is boggle's "wow" moment. It leads with the
    // flourish so the headline reads before the word does — and so the line
    // fits the header's ~26 phone characters.
    case 'accepted_peer':
      return {
        outcome: 'won',
        text: `${answer.word.length >= 7 ? 'wow!' : 'found'} ${wordWithBonusBullet(answer.word, answer.isBonus)} +${answer.points}`,
      }

    case 'already_found':
      return { outcome: 'warning', text: `${wordWithBonusBullet(answer.word, answer.isBonus)} — already found` }
    case 'too_short':
      return { outcome: 'warning', text: `${answer.word.toUpperCase()} — too short` }

    case 'not_on_board':
      return { outcome: 'lost', text: `${answer.word.toUpperCase()} — not on board` }
    case 'not_a_word':
      return { outcome: 'lost', text: `${answer.word.toUpperCase()} — not a word` }
  }
}

/**
 * Which of this game's answers the engine's report is. The engine knows only
 * that a word missed the list; the board says why — whether any path spells it.
 */
export function answerOf(report: WordSubmitReport, board: string): GAnswer {
  const word = report.word
  switch (report.answer) {
    case 'accepted':
      return { answerType: 'accepted', word, points: report.entry.points, isBonus: report.entry.isBonus }
    case 'already_found':
      return { answerType: 'already_found', word, isBonus: report.entry?.isBonus ?? false }
    case 'too_short':
      return { answerType: 'too_short', word }
    case 'not_legal':
      return traceableStr(board, word)
        ? { answerType: 'not_a_word', word }
        : { answerType: 'not_on_board', word }
  }
}

/** The columns of a `boggle.found_words` row that say what it WAS. */
type LoggedWord = { word: string; points: number; is_bonus: boolean }

/**
 * How a teammate's found word reads in the header. The caller has already
 * established that the row is not the viewer's own (its own line is the local
 * slot's).
 */
export function peerAnswerMessage(row: LoggedWord): AnswerMessage {
  return answerMessage({ answerType: 'accepted_peer', word: row.word, points: row.points, isBonus: row.is_bonus })
}
