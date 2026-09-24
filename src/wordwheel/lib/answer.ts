// cs-met-wordwheel

import type { AnswerMessage } from '@/common/feedback/FeedbackMessage'
import { wordWithBonusDot, type WordSubmitReport } from '@/shared/found-words/useFoundWordSubmit'

/**
 * Everything that can be SAID about a word in this game, as a closed set — and
 * **read as a list, it is the whole roster of what this game tells anybody.**
 *
 * "_peer" versions are answers that come from subscriptions and are for peer
 * feedback. `word` is lowercase, as the engine and the rows carry it.
 */
export type Answer =
  // My word counted.
  | { answerType: 'accepted'; word: string; points: number; isBonus: boolean; isPangram: boolean }
  // A coop teammate's did, off `found_words`.
  | { answerType: 'accepted_peer'; word: string; points: number; isBonus: boolean; isPangram: boolean }

  // Already found — by anyone in coop, by me in compete.
  | { answerType: 'already_found'; word: string; isBonus: boolean }
  // Fewer than four letters.
  | { answerType: 'too_short'; word: string }

  // Not in the list, by why: the center letter is missing…
  | { answerType: 'missing_center'; word: string; center: string }
  // …or it is simply not a word. A word the wheel's tiles cannot spell never
  // gets here: BoardCol's `submitDisabled` gate vetoes its submit.
  | { answerType: 'not_a_word'; word: string }

  // A compete opponent climbed a rank. It has no twin of mine: my own rank is
  // the RankBar's, and an opponent's words are hidden, so this is all there is.
  | { answerType: 'reached_peer'; rank: string }

/**
 * How an answer reads — **the one place this game decides that.** The pill and
 * the header's peer lines read it.
 *
 * The readings are its siblings', because it is the same event: the letters are
 * in front of you and the list is the ordinary English one, so a word that does
 * not count is a WRONG MOVE (`lost`). Too short and already found are not — you
 * have not finished typing, or you already have it — so they are `warning`.
 */
export function answerMessage(answer: Answer): AnswerMessage {
  switch (answer.answerType) {
    case 'accepted':
      return {
        outcome: 'won',
        text: `${wordWithBonusDot(answer.word, answer.isBonus)} — ${answer.isPangram ? 'pangram ' : ''}+${answer.points}`,
      }
    // A pangram leads with the label and the moose, so the headline reads
    // before the word does — and so the line fits the header's ~26 phone
    // characters.
    case 'accepted_peer':
      return {
        outcome: 'won',
        text: `${answer.isPangram ? 'pangram 🦌' : 'found'} ${wordWithBonusDot(answer.word, answer.isBonus)} +${answer.points}`,
      }

    case 'already_found':
      return { outcome: 'warning', text: `${wordWithBonusDot(answer.word, answer.isBonus)} — already found` }
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
export function answerOf(report: WordSubmitReport, center: string): Answer {
  const word = report.word
  switch (report.answer) {
    case 'accepted':
      return {
        answerType: 'accepted',
        word,
        points: report.entry.points,
        isBonus: report.entry.isBonus,
        isPangram: report.entry.isPangram ?? false,
      }
    case 'already_found':
      return { answerType: 'already_found', word, isBonus: report.entry?.isBonus ?? false }
    case 'too_short':
      return { answerType: 'too_short', word }
    case 'not_legal':
      return !word.includes(center)
        ? { answerType: 'missing_center', word, center }
        : { answerType: 'not_a_word', word }
  }
}

/** The columns of a `wordwheel.found_words` row that say what it WAS. */
type LoggedWord = { word: string; points: number; is_bonus: boolean; is_pangram?: boolean }

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
    isBonus: row.is_bonus,
    isPangram: row.is_pangram ?? false,
  })
}
