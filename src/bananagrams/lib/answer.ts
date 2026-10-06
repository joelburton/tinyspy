// cs-unmet

import type { AnswerMessage } from '@/common/feedback/FeedbackMessage'
import type { GAnswer, GEvent, GPlayer } from '../types'

/**
 * How an answer reads — **the one place this game decides that.** The
 * below-board slot reads it for a peel, a dump and a check. An empty `text`
 * means nothing is shown: the answer's only job there is its outcome.
 *
 * The readings, which are this game's rather than the vocabulary's:
 *
 *   - a **peel** and a **dump** are draws, not verdicts: `neutral`. A peel is
 *     announced to everyone it dealt to; a dump only to the dumper.
 *   - **going out** is the game's ending, and the ending's message says it:
 *     no words here.
 *   - a peel the board check **blocks** is the move going wrong: `lost`, and
 *     the red cells are the real answer.
 *   - a **check** says how to read its red cells: `won` when there are none,
 *     `noted` for a board with nothing on it, `lost` otherwise.
 *
 * A dumped letter is stored lowercase and capitalized here, since a sentence is
 * where CSS cannot reach.
 */
export function answerMessage(answer: GAnswer): AnswerMessage {
  switch (answer.answerType) {
    case 'peel':
      return { outcome: 'neutral', text: '🍌 Peel!' }
    case 'peel_peer':
      return { outcome: 'neutral', text: 'peeled' }
    case 'dump':
      return { outcome: 'neutral', text: `Dumped ${answer.tile.toUpperCase()}` }
    case 'went_out':
      return { outcome: 'neutral', text: '' }
    case 'peel_invalid':
      return {
        outcome: 'lost',
        text: 'Fix the highlighted tiles before peeling — every word must be real and the grid one connected piece.',
      }
    case 'check_clean':
      return { outcome: 'won', text: 'Every word checks out, and the grid is one piece.' }
    case 'check_empty':
      return { outcome: 'noted', text: 'Nothing on the board to check yet.' }
    case 'check_invalid':
      return {
        outcome: 'lost',
        text: `${answer.nTiles} tile${answer.nTiles === 1 ? '' : 's'} highlighted — either not a real word, or not joined to the grid.`,
      }
  }
}

/** A logged row as the answer it was, from where `me` sits: a peel is mine or
 *  somebody else's. */
export function answerOfEvent(event: GEvent, me: GPlayer): GAnswer {
  switch (event.kind) {
    case 'peel':
      return { answerType: event.by === me ? 'peel' : 'peel_peer' }
    case 'dump':
      // A dump row always carries the letter dumped.
      return { answerType: 'dump', tile: event.tile! }
    case 'went_out':
      return { answerType: 'went_out' }
  }
}
