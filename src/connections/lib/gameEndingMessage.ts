// cs-unmet

import type { EndOutcome, GameEnding } from '@/common/terminal/gameEnding'
import {
  buildGameEndedMessageNeutral,
  type TerminalMessage,
} from '@/common/terminal/terminalMessage'

/**
 * What connections says once the game is over, for its ending and mode.
 *
 * `pillText` + `outcome` are the below-board verdict; `infoColText` + `outcome`
 * are the short, bold, color-coded line in the info column (won = green,
 * lost = red, a Stop = neutral). Both come back in one object so the two
 * surfaces cannot disagree.
 *
 * The words come from the game's ending; the outcome is MINE, as the database
 * wrote it (`common.game_players.outcome`), never worked out here. Coop
 * verdicts are team-wide; compete tells the racer who matched all four (the
 * winner) from two losers — eliminated on mistakes, or beaten to the punch by
 * an opponent who finished first.
 *
 * Verdicts are terse and unpunctuated ("Lost: out of mistakes"), the shared
 * sweep vocabulary — the pill is a fixed-height, ellipsizing row that has to
 * fit a phone. Call it only when the game HAS ended; it has no answer for a
 * live one.
 */
export function buildGameEndingMessage({
  mode,
  gameEnding,
  playerOutcome,
  winnerName,
  iWasEliminated,
}: {
  mode: 'coop' | 'compete'
  // How the game ended. The reason is the act that ended it — the clock
  // (`timeout`), every racer dropping out (`conceded`), the last mistakes
  // spent (`resource_exhausted`), four bands (`reached_goal`) — and the
  // club-list label reads the same one, so the two surfaces name one reason.
  gameEnding: Pick<GameEnding, 'outcome' | 'reason'>
  // How I came out; null for a club member watching without a seat.
  playerOutcome: EndOutcome | null
  // Compete: the winner's username (for a watcher's "X won").
  winnerName: string
  // Compete: I spent my mistakes before the race ended
  // (`player_ended_reason` = `resource_exhausted`). Tells the out-of-mistakes
  // loss from "beaten to the punch".
  iWasEliminated: boolean
}): TerminalMessage {
  /** The two texts, for the game's ending and whether it went my way. */
  function makeGameEndingWords(): Pick<TerminalMessage, 'pillText' | 'infoColText'> {
    // A Stop is the uniform neutral ending shared with the other games — the
    // shared message owns its words.
    if (gameEnding.outcome === 'neutral') return buildGameEndedMessageNeutral(mode)

    if (mode === 'coop') {
      // Coop cannot concede, so a loss is the clock or the mistakes.
      if (gameEnding.outcome === 'won') {
        return { pillText: 'You win!', infoColText: 'You won!' }
      } else if (gameEnding.reason === 'timeout') {
        return { pillText: 'Lost: out of time', infoColText: 'Out of time' }
      } else if (gameEnding.reason === 'resource_exhausted') {
        return { pillText: 'Lost: out of mistakes', infoColText: 'Out of mistakes' }
      }
    } else if (mode === 'compete') {
      if (gameEnding.outcome === 'won') {
        if (playerOutcome === 'won') {
          return { pillText: 'Won: the race', infoColText: 'You won!' }
        } else if (playerOutcome === 'lost' || playerOutcome === 'near') {
          if (iWasEliminated) {
            return { pillText: 'Lost: out of mistakes', infoColText: 'Out of mistakes' }
          } else {
            return { pillText: 'Beaten to the punch', infoColText: 'Opponent won' }
          }
        } else if (playerOutcome === null) {
          // SPECTATING: a watcher is told who won, not that they were beaten.
          return { pillText: `${winnerName} won`, infoColText: `${winnerName} won` }
        }
      // Otherwise nobody won: the clock, every racer conceded, or the
      // mistakes. A MIXED table — someone conceded, someone played it out — is
      // `resource_exhausted`, the server's own call (`connections.concede`).
      } else if (gameEnding.reason === 'timeout') {
        return { pillText: 'Out of time — no winner', infoColText: 'Out of time' }
      } else if (gameEnding.reason === 'conceded') {
        return { pillText: 'All conceded — no winner', infoColText: 'All conceded' }
      } else if (gameEnding.reason === 'resource_exhausted') {
        return { pillText: 'Everyone eliminated', infoColText: 'All eliminated' }
      }
    }

    throw new Error(
      `BUG: connections has no words for a ${mode} ending `
        + `${gameEnding.outcome}/${gameEnding.reason} with player outcome ${playerOutcome}`,
    )
  }

  // SPECTATING: a watcher has no outcome of their own, so the message reads
  // the game's.
  const outcome = playerOutcome ?? gameEnding.outcome
  return { ...makeGameEndingWords(), outcome }
}
