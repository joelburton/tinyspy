// cs-met-spellingbee

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

  // Not in the list, by why: a letter that is not on the hive…
  | { answerType: 'bad_letters'; word: string }
  // …every letter on the hive, but not the center one…
  | { answerType: 'missing_center'; word: string; center: string }
  // …or a word made of the right letters that is simply not a word.
  | { answerType: 'not_a_word'; word: string }

  // A compete opponent climbed a rank. It has no twin of mine: my own rank is
  // the RankBar's, and an opponent's words are hidden, so this is all there is.
  | { answerType: 'reached_peer'; rank: string }

/**
 * How an answer reads — **the one place this game decides that.** The pill,
 * the hexes a refused word used, and the header's peer lines all read it.
 */
export function answerMessage(answer: Answer): AnswerMessage {
  switch (answer.answerType) {
    case 'accepted':
      return {
        outcome: 'won',
        text: `${wordWithBonusDot(answer.word, answer.isBonus)} — ${answer.isPangram ? 'pangram ' : ''}+${answer.points}`,
      }
    // A pangram leads with the label and the bee, so the headline reads before
    // the word does — and so the line fits the header's ~26 phone characters.
    case 'accepted_peer':
      return {
        outcome: 'won',
        text: `${answer.isPangram ? 'pangram 🐝' : 'found'} ${wordWithBonusDot(answer.word, answer.isBonus)} +${answer.points}`,
      }

    case 'already_found':
      return { outcome: 'warning', text: `${wordWithBonusDot(answer.word, answer.isBonus)} — already found` }
    case 'too_short':
      return { outcome: 'warning', text: `${answer.word.toUpperCase()} — too short` }

    case 'bad_letters':
      return { outcome: 'lost', text: `${answer.word.toUpperCase()} — bad letters` }
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
 * that a word missed the list; the hive says why.
 *
 * `letters` is the hive's seven letters, lowercase, the center among them.
 */
export function answerOf(
  report: WordSubmitReport,
  hive: { letters: ReadonlySet<string>; center: string },
): Answer {
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
      if ([...word].some((ch) => !hive.letters.has(ch))) return { answerType: 'bad_letters', word }
      if (!word.includes(hive.center)) return { answerType: 'missing_center', word, center: hive.center }
      return { answerType: 'not_a_word', word }
  }
}

/** The columns of a `spellingbee.found_words` row that say what it WAS. */
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
