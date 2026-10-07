// cs-unmet

import type { EndOutcome } from '@/common/ending/gameEnding'
import {
  buildGameEndedMessageNeutral,
  type EndingMessage,
} from '@/common/ending/endingMessage'

/**
 * The ending's message for codenamesduet: `pillText` + `outcome` are the
 * below-board verdict; `infoColText` + `outcome` the short, bold line in the
 * info column's action row. Duet is a team of two, so the game's ending is
 * both players' — there is no message of a player's own.
 *
 * The outcome is the server's (`gd.outcome`) and the cause its `detail`:
 * `solved` for the 15th agent, `assassin`, `neutral` for a bystander in sudden
 * death, `timeout` for the countdown, and a Stop's neutral ending.
 *
 * The loss verdicts are terse ("Lost: assassin") rather than sentences: the
 * pill is a fixed-height below-board slot, and on a phone a long verdict wraps
 * and grows it.
 */
export function buildGameEndingMessage({
  outcome,
  detail,
}: {
  outcome: EndOutcome
  detail: string
}): EndingMessage {
  switch (outcome) {
    case 'won':
      return { pillText: 'You win!', infoColText: 'You won!', outcome: 'won' }
    case 'lost':
      switch (detail) {
        case 'assassin':
          return {
            pillText: 'Lost: assassin',
            infoColText: 'Assassin revealed',
            outcome: 'lost',
          }
        case 'neutral':
          return {
            pillText: 'Lost: out of turns',
            infoColText: 'Out of turns',
            outcome: 'lost',
          }
        case 'timeout':
          return {
            pillText: 'Lost: out of time',
            infoColText: 'Out of time',
            outcome: 'lost',
          }
        // A loss whose cause nobody wrote a case for is still a loss.
        default:
          return { pillText: 'Lost', infoColText: 'Lost', outcome: 'lost' }
      }
    // A Stop: the friends ended the game on purpose — the shared neutral ending.
    case 'neutral':
      return buildGameEndedMessageNeutral('coop')
    // An ending nobody wrote a case for says so, neutrally and with its raw
    // name, rather than claiming a win or a loss it cannot know.
    default:
      return {
        pillText: `Game over: ${outcome}`,
        infoColText: 'Game over',
        outcome: 'neutral',
      }
  }
}
