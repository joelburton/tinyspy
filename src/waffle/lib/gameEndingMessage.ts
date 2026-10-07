// cs-unmet

import type { EndOutcome, GameEnding } from '@/common/ending/gameEnding'
import {
  buildGameEndedMessageNeutral,
  type EndingMessage,
} from '@/common/ending/endingMessage'

/**
 * What waffle says once the game is over, for its ending and mode.
 *
 * `pillText` + `outcome` are the below-board verdict; `infoColText` + `outcome`
 * are the short, bold, color-coded line in the info column (won = green,
 * lost = red, a Stop = neutral). Both come back in one object so the two
 * surfaces cannot disagree.
 *
 * The words come from the game's ending; the outcome is MINE, as the database
 * wrote it (`common.game_players.outcome`), never worked out here. A coop win
 * is measured against par — par is the generator's minimum, so over par is the
 * norm and matching it is the boast. Compete is won by fewest swaps.
 *
 * Call it only when the game HAS ended; it has no answer for a live one.
 */
export function buildGameEndingMessage({
  mode,
  gameEnding,
  playerOutcome,
  nSwapsOverPar,
}: {
  mode: 'coop' | 'compete'
  // How the game ended. The reason is the act that ended it — the timer
  // (`timeout`), every player dropping out (`conceded`), the last swaps spent
  // (`resource_exhausted`), a solve (`reached_goal`) — and the club-list label
  // reads the same one.
  gameEnding: Pick<GameEnding, 'outcome' | 'reason'>
  // How I came out, written with the game's ending.
  playerOutcome: EndOutcome
  // Coop: the team's swaps minus par, for the win's words.
  nSwapsOverPar: number
}): EndingMessage {
  /** The two texts, for the game's ending and whether it went my way. */
  function makeGameEndingWords(): Pick<EndingMessage, 'pillText' | 'infoColText'> {
    // A Stop is the uniform neutral ending shared with the other games — the
    // shared message owns its words.
    if (gameEnding.outcome === 'neutral') return buildGameEndedMessageNeutral(
      mode)

    if (mode === 'coop') {
      // Coop cannot concede, so a loss is the timer or the swaps.
      if (gameEnding.outcome === 'won') {
        // Prefixed `Won:` like every other verdict — the par figure alone reads
        // as a score. Under par cannot happen; it is said honestly if it does.
        const parVerdict =
          nSwapsOverPar === 0
            ? 'Won: par!'
            : nSwapsOverPar > 0
              ? `Won: par +${nSwapsOverPar}`
              : `Won: par −${-nSwapsOverPar}`
        return { pillText: parVerdict, infoColText: parVerdict }
      } else if (gameEnding.reason === 'timeout') {
        return { pillText: 'Lost: out of time', infoColText: 'Out of time' }
      } else if (gameEnding.reason === 'resource_exhausted') {
        return { pillText: 'Lost: out of swaps', infoColText: 'Out of swaps' }
      }
    } else if (mode === 'compete') {
      if (gameEnding.outcome === 'won') {
        if (playerOutcome === 'won') {
          return { pillText: 'Won: fewest swaps', infoColText: 'You won!' }
        } else if (playerOutcome === 'lost' || playerOutcome === 'near') {
          return {
            pillText: 'Lost: beaten on swaps',
            infoColText: 'Opponent won',
          }
        }
        // Otherwise nobody won. No `Lost:` prefix on any of these — nobody was
        // beaten, the game just ran out.
      } else if (gameEnding.reason === 'timeout') {
        return {
          pillText: 'Out of time — no winner',
          infoColText: 'Out of time',
        }
      } else if (gameEnding.reason === 'conceded') {
        return {
          pillText: 'All conceded — no winner',
          infoColText: 'All conceded',
        }
      } else if (gameEnding.reason === 'resource_exhausted') {
        return { pillText: 'Nobody solved', infoColText: 'No winner' }
      }
    }

    throw new Error(
      `BUG: waffle has no words for a ${mode} ending `
      +
      `${gameEnding.outcome}/${gameEnding.reason} with player outcome ${playerOutcome}`,
    )
  }

  return { ...makeGameEndingWords(), outcome: playerOutcome }
}
