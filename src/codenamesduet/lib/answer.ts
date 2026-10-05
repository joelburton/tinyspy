// cs-blessed-codenamesduet

import type { AnswerMessage } from '@/common/feedback/FeedbackMessage'
import type { GAnswer } from '../types'

/**
 * How an answer reads — **the one place this game decides that.** An empty
 * `text` means nothing is shown.
 *
 * **Telegraphic on purpose** ("waiting for you", not "is waiting for your turn
 * to complete"): the header shares its row with the logo and chat bubble, so
 * on a 390px phone it fits ~26 characters and silently ELLIPSIZES the rest —
 * and the partner's dot alone eats two of them. The words carry no name and no
 * verb for the same reason; the pill draws "● moth" ahead of them. Keep
 * additions this short.
 */
export function answerMessage(answer: GAnswer): AnswerMessage {
  switch (answer.answerType) {
    case 'writing_clue_peer':
      return { outcome: 'neutral', text: 'writing clue' }
    case 'guessing_peer':
      return { outcome: 'neutral', text: 'guessing' }
    case 'waiting_for_clue_peer':
      return { outcome: 'neutral', text: 'waiting for clue' }
    case 'waiting_for_you_peer':
      return { outcome: 'neutral', text: 'waiting for you' }

    case 'hint_peer':
      return { outcome: 'warning', text: 'got hint' }

    case 'clue_ai':
      return { outcome: 'warning', text: '' }
  }
}

/**
 * Which of the four turn answers holds now, from the phase `derivePhase`
 * computes — the latest move alone cannot say it, because after a bystander or
 * a pass the finished-player rule decides who clues next.
 *
 * `null` while there is nothing to say about the partner: the game is over, or
 * in sudden death, where nobody clues and either player may guess. Sudden death
 * is not a partner's move, and parked in the header it would outrank every chat
 * line for the rest of the game; the clue strip carries it instead.
 */
export function turnAnswer(phase: {
  isGuessPhase: boolean
  isClueGiver: boolean
  inSuddenDeath: boolean
  isTerminal: boolean
}): GAnswer | null {
  if (phase.isTerminal || phase.inSuddenDeath) return null
  if (!phase.isGuessPhase) {
    return { answerType: phase.isClueGiver ? 'waiting_for_clue_peer' : 'writing_clue_peer' }
  }
  return { answerType: phase.isClueGiver ? 'guessing_peer' : 'waiting_for_you_peer' }
}
