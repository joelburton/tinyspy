// cs-unmet

import type { EndOutcome, GameEnding } from '@/common/ending/gameEnding'
import {
  buildGameEndedMessageNeutral,
  type EndingMessage,
} from '@/common/ending/endingMessage'

/**
 * What wordle says once the game is over, for its ending and mode.
 *
 * `pillText` + `outcome` are the below-board verdict; `infoColText` + `outcome`
 * are the short, bold, color-coded line in the info column (won = green,
 * lost = red, a Stop = neutral). Both come back in one object so the two
 * surfaces cannot disagree.
 *
 * The words come from the game's ending; the outcome is MINE, as the database
 * wrote it (`common.game_players.outcome`), never worked out here. Compete is
 * won by fewest guesses with the earlier solve as the tie-break, so its words
 * tell "fewest guesses" from "same guesses, but faster" on both sides of the
 * result — and a game the countdown ended tells a player still guessing that
 * time ran out, rather than that they were beaten on a count they never
 * finished.
 *
 * Verdicts are terse and unpunctuated ("Lost: out of guesses"), the shared
 * sweep vocabulary — the pill is a fixed-height, ellipsizing row that has to
 * fit a phone. Call it only when the game HAS ended; it has no answer for a
 * live one.
 */
export function buildGameEndingMessage({
  mode,
  gameEnding,
  playerOutcome,
  iSolved,
  isMyTieBrokenByClock,
}: {
  mode: 'coop' | 'compete'
  // How the game ended. The reason is the act that ended it — the clock
  // (`timeout`), every player dropping out (`conceded`), the last guesses spent
  // (`resource_exhausted`), a solve (`reached_goal`) — and the club-list label
  // reads the same one, so the two surfaces name one reason.
  gameEnding: Pick<GameEnding, 'outcome' | 'reason'>
  // How I came out, written with the game's ending.
  playerOutcome: EndOutcome
  // Compete: I typed the target. Tells a player the clock stopped from one it
  // merely outranked.
  iSolved: boolean
  // Compete: the earlier solve, not the guess count, placed me against the
  // winner (`gd.me.tieBrokenByClock`) — I won on it, or lost on it.
  isMyTieBrokenByClock: boolean
}): EndingMessage {
  /** The two texts, for the game's ending and whether it went my way. */
  function makeGameEndingWords(): Pick<EndingMessage, 'pillText' | 'infoColText'> {
    // A Stop is the uniform neutral ending shared with the other games — the
    // shared message owns its words.
    if (gameEnding.outcome === 'neutral') return buildGameEndedMessageNeutral(mode)

    if (mode === 'coop') {
      // Coop cannot concede, so a loss is the clock or the guesses.
      if (gameEnding.outcome === 'won') {
        return { pillText: 'Won: solved it', infoColText: 'Solved it!' }
      } else if (gameEnding.reason === 'timeout') {
        return { pillText: 'Lost: out of time', infoColText: 'Out of time' }
      } else if (gameEnding.reason === 'resource_exhausted') {
        return { pillText: 'Lost: out of guesses', infoColText: 'Out of guesses' }
      }
    } else if (mode === 'compete') {
      if (gameEnding.outcome === 'won') {
        if (playerOutcome === 'won') {
          if (isMyTieBrokenByClock) {
            return { pillText: 'Won: same guesses, but faster', infoColText: 'You won (faster)' }
          } else if (gameEnding.reason === 'timeout') {
            return { pillText: 'Won: solved before time ran out', infoColText: 'You won!' }
          } else {
            return { pillText: 'Won: fewest guesses', infoColText: 'You won!' }
          }
        } else if (playerOutcome === 'lost' || playerOutcome === 'near') {
          if (isMyTieBrokenByClock) {
            return { pillText: 'Lost: beaten on the clock', infoColText: 'Opponent won (faster)' }
          } else if (gameEnding.reason === 'timeout' && !iSolved) {
            return { pillText: 'Lost: time ran out', infoColText: 'Opponent won' }
          } else {
            return { pillText: 'Lost: beaten on guesses', infoColText: 'Opponent won' }
          }
        }
      // Otherwise nobody won. No `Lost:` prefix on any of these — nobody was
      // beaten, the game just ran out.
      } else if (gameEnding.reason === 'timeout') {
        return { pillText: 'Out of time — no winner', infoColText: 'Out of time' }
      } else if (gameEnding.reason === 'conceded') {
        return { pillText: 'All conceded — no winner', infoColText: 'All conceded' }
      } else if (gameEnding.reason === 'resource_exhausted') {
        return { pillText: 'Nobody solved', infoColText: 'No winner' }
      }
    }

    throw new Error(
      `BUG: wordle has no words for a ${mode} ending `
        + `${gameEnding.outcome}/${gameEnding.reason} with player outcome ${playerOutcome}`,
    )
  }

  return { ...makeGameEndingWords(), outcome: playerOutcome }
}
