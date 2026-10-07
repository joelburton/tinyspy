// cs-unmet

import type { EndOutcome, GameEnding } from '@/common/ending/gameEnding'
import {
  buildStoppedMessage,
  type EndingMessage,
} from '@/common/ending/endingMessage'
import type { Actor } from '@/common/members/member'

/**
 * What stackdown says once the game is over, for its ending and mode.
 *
 * `pillText` + `outcome` are the below-board verdict; `infoColText` + `outcome`
 * are the short, bold, color-coded line in the info column. Both come back in
 * one object so the two surfaces cannot disagree.
 *
 * The words come from the game's ending; the outcome is MINE, as the database
 * wrote it (`common.game_players.outcome`), never worked out here. Coop wins by
 * clearing the stack and loses only to a timeout. Compete is a race: the first
 * to clear wins, and the timer or every racer conceding ends it with no winner.
 *
 * Call it only when the game HAS ended; it has no answer for a live one.
 */
export function buildGameEndingMessage({
  mode,
  gameEnding,
  playerOutcome,
  winner,
}: {
  mode: 'coop' | 'compete'
  // How the game ended: a clear (`reached_goal`), the timer (`timeout`), every
  // racer dropping out (`conceded`), or a Stop (`neutral`).
  gameEnding: Pick<GameEnding, 'outcome' | 'reason'>
  // How I came out, written with the game's ending.
  playerOutcome: EndOutcome
  // Who cleared it first, in a race someone won.
  winner: Actor | null
}): EndingMessage {
  /** The texts, and the person the verdict names, for the game's ending and
   *  whether it went my way. */
  function makeGameEndingWords(): Omit<EndingMessage, 'outcome'> {
    // A Stop is the uniform neutral ending shared with the other games — the
    // shared message owns its words.
    if (gameEnding.outcome === 'neutral') return buildStoppedMessage(mode)

    if (mode === 'coop') {
      if (gameEnding.outcome === 'won') {
        return { pillText: 'Won: stack cleared', infoColText: 'Cleared!' }
      } else if (gameEnding.reason === 'timeout') {
        return { pillText: 'Lost: out of time', infoColText: 'Out of time' }
      }
      return { pillText: 'Lost: stack not cleared', infoColText: 'Not cleared' }
    }

    if (gameEnding.outcome === 'won' && playerOutcome === 'won') {
      return { pillText: 'Won: cleared it first', infoColText: 'You won!' }
    } else if (gameEnding.outcome === 'won') {
      // A loss names WHO beat you: the winner rides as `actor`, and the pill
      // draws the mention the way every other message names someone.
      return {
        pillText: 'cleared it first',
        infoColText: `${winner?.username ?? 'a player'} won`,
        actor: winner ?? undefined,
      }
    } else if (gameEnding.reason === 'timeout') {
      // No `Lost:` prefix: nobody was beaten, the stack outlasted everyone.
      return { pillText: 'Out of time — no winner', infoColText: 'Out of time' }
    }
    return { pillText: 'Nobody cleared it', infoColText: 'No winner' }
  }

  return { ...makeGameEndingWords(), outcome: playerOutcome }
}
