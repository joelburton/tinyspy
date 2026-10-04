// cs-blessed-wordwheel

import type { AnswerMessage } from '@/common/feedback/FeedbackMessage'
import { type WordSubmitReport } from '@/shared/found-words/useFoundWordSubmit'
import { wordWithBonusBullet } from '@/shared/found-words/foundWords'
import type { GAnswer } from '../types'

/**
 * How an answer reads — **the one place this game decides that.** The pill, the
 * tiles a refused word used, and the header's peer lines all read it.
 */
export function answerMessage(answer: GAnswer): AnswerMessage {
  switch (answer.answerType) {
    case 'accepted':
      return {
        outcome: 'won',
        text: `${wordWithBonusBullet(answer.word, answer.bonus)} — ${answer.pangram ? 'pangram ' : ''}+${answer.points}`,
      }
    // A pangram leads with the label and the moose, so the headline reads
    // before the word does — and so the line fits the header's ~26 phone
    // characters.
    case 'accepted_peer':
      return {
        outcome: 'won',
        text: `${answer.pangram ? 'pangram 🦌' : 'found'} ${wordWithBonusBullet(answer.word, answer.bonus)} +${answer.points}`,
      }

    case 'already_found':
      return { outcome: 'warning', text: `${wordWithBonusBullet(answer.word, answer.bonus)} — already found` }
    case 'too_short':
      return { outcome: 'warning', text: `${answer.word.toUpperCase()} — too short` }

    // The letter itself, quoted, rather than the rule: shorter than "missing
    // center letter", and it says what to add.
    case 'missing_center':
      return { outcome: 'lost', text: `${answer.word.toUpperCase()} — missing "${answer.center.toUpperCase()}"` }
    case 'not_a_word':
      return { outcome: 'lost', text: `${answer.word.toUpperCase()} — not a word` }

    case 'reached_peer':
      return { outcome: 'noted', text: `reached ${answer.rank}` }
  }
}

/**
 * Which of this game's answers the engine's report is. The engine knows only
 * that a word missed the list; the wheel's center says whether that is why.
 *
 * `center` is lowercase.
 */
export function answerOf(report: WordSubmitReport, center: string): GAnswer {
  const word = report.word
  switch (report.answer) {
    case 'accepted':
      return {
        answerType: 'accepted',
        word,
        points: report.entry.points,
        bonus: report.entry.bonus,
        pangram: report.entry.pangram,
      }
    case 'already_found':
      return { answerType: 'already_found', word, bonus: report.entry?.bonus ?? false }
    case 'too_short':
      return { answerType: 'too_short', word }
    case 'not_legal':
      return !word.includes(center)
        ? { answerType: 'missing_center', word, center }
        : { answerType: 'not_a_word', word }
  }
}

/** What a find WAS: the word, its score and its flags, off `gd.foundWords`. */
type LoggedWord = { word: string; points: number; bonus: boolean; pangram: boolean }

/**
 * How a teammate's found word reads in the header. The caller has already
 * established that the row is not the viewer's own (its own line is the local
 * slot's).
 */
export function peerAnswerMessage(row: LoggedWord): AnswerMessage {
  return answerMessage({
    answerType: 'accepted_peer',
    word: row.word,
    points: row.points,
    bonus: row.bonus,
    pangram: row.pangram,
  })
}
