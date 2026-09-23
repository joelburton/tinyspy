// cs-met-codenamesduet

import type { AnswerMessage } from '@/common/feedback/FeedbackMessage'

/**
 * Everything that can be SAID about a move in this game, as a closed set — and
 * **read as a list, it is the whole roster of what this game tells anybody.**
 *
 * "_peer" versions are answers that come from subscriptions and are for peer
 * feedback.
 *
 * A guess of mine has no answer here: the tile turning over says it, and a
 * pill would only repeat the board. The terminal verdicts are not answers
 * either — they are the shared shape every game's `buildTerminalMessage` returns.
 */
export type Answer =
  // Where the turn stands after my partner's latest move, or mine: what my
  // PARTNER is doing now. Each holds in the header until the next move
  // replaces it.
  //   they hold the clue seat and have not given the clue yet
  | { answerType: 'writing_clue_peer' }
  //   they are guessing from my clue
  | { answerType: 'guessing_peer' }
  //   I hold the clue seat; they wait for my clue
  | { answerType: 'waiting_for_clue_peer' }
  //   I am guessing from their clue; they wait for me
  | { answerType: 'waiting_for_you_peer' }

  // My partner asked the AI for a clue. (My own asking has no answer: the
  // suggestion dialog is its feedback.)
  | { answerType: 'hint_peer' }

  // A clue given exactly as the AI suggested it. Nothing is SAID — the answer's
  // job is its outcome, which the event log's mark on that clue wears. A clue
  // the giver edited, or thought of alone, has no answer here.
  | { answerType: 'clue_ai' }

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
export function answerMessage(answer: Answer): AnswerMessage {
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
  gameOver: boolean
}): Answer | null {
  if (phase.gameOver || phase.inSuddenDeath) return null
  if (!phase.isGuessPhase) {
    return { answerType: phase.isClueGiver ? 'waiting_for_clue_peer' : 'writing_clue_peer' }
  }
  return { answerType: phase.isClueGiver ? 'guessing_peer' : 'waiting_for_you_peer' }
}
