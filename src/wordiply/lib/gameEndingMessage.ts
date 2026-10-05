// cs-unmet

import type { Actor } from '@/common/members/member'
import type { EndOutcome, GameEnding } from '@/common/terminal/gameEnding'
import {
  buildGameEndedMessageNeutral,
  type TerminalMessage,
} from '@/common/terminal/terminalMessage'

/**
 * What wordiply says once the game is over, for its ending and mode.
 *
 * `pillText` + `outcome` are the below-board verdict; `infoColText` + `outcome`
 * are the short line in the info column. Both come back in one object so the
 * two surfaces cannot disagree. The scores, hidden all game, land here.
 *
 * The words come from the game's ending and the scores the builder wrote; the
 * outcome is MINE, as the database wrote it, never worked out here. Coop's
 * five words spent is a win, drawn in the win's color, but its words stay
 * "Ended": the team did as well as it did, and the score says how well. Only
 * compete says "Won", where someone beat someone.
 *
 * Verdicts are terse and unpunctuated — the pill is a one-line, ellipsizing
 * row that has to fit a phone. Call it only when the game HAS ended.
 */
export function buildGameEndingMessage({
  mode,
  gameEnding,
  playerOutcome,
  teamScores,
  winner,
}: {
  mode: 'coop' | 'compete'
  // How the game ended. The reason is the act that ended it, and the club-list
  // label reads the same one.
  gameEnding: Pick<GameEnding, 'outcome' | 'reason'>
  // How I came out, written with the game's ending.
  playerOutcome: EndOutcome
  // Coop: the team's two scores, written once the game has ended; null in
  // compete.
  teamScores: { lengthScore: number; nLetters: number } | null
  // Compete: the player ranked first and their length score; null when nobody
  // won, and in coop.
  winner: (Actor & { lengthScore: number }) | null
}): TerminalMessage {
  /** The two texts, for the game's ending and whether it went my way. */
  function makeGameEndingWords(): Pick<TerminalMessage, 'pillText' | 'infoColText' | 'actor'> {
    if (mode === 'coop') {
      // The team's scores, written with every coop ending.
      const { lengthScore, nLetters } = teamScores!
      if (gameEnding.reason === 'timeout') {
        return { pillText: `Lost: out of time, ${lengthScore}%`, infoColText: `Length ${lengthScore}%` }
      }
      // The five words spent, or a Stop: the same report, in its own color.
      return { pillText: `Ended: ${lengthScore}%, ${nLetters} letters`, infoColText: `Length ${lengthScore}%` }
    }

    // A Stop is the uniform neutral ending shared with the other games.
    if (gameEnding.outcome === 'neutral') return buildGameEndedMessageNeutral(mode)

    if (gameEnding.outcome === 'won') {
      // A won race has its winner (`ending.winner`, ranked first).
      const { lengthScore } = winner!
      if (playerOutcome === 'won') {
        return { pillText: `Won: ${lengthScore}%`, infoColText: 'You won!' }
      }
      // The pill names who beat me, the way every other message names someone.
      return { pillText: `won at ${lengthScore}%`, infoColText: `${winner!.username} won`, actor: winner! }
    }

    // Nobody scored, so nobody won: each names its cause, agreeing with the
    // club card's `Lost (…)` label.
    if (gameEnding.reason === 'conceded') {
      return { pillText: 'Lost: all conceded', infoColText: 'All conceded' }
    } else if (gameEnding.reason === 'timeout') {
      return { pillText: 'Lost: out of time, nobody scored', infoColText: 'Out of time' }
    } else if (gameEnding.reason === 'resource_exhausted') {
      return { pillText: 'Lost: out of guesses, nobody scored', infoColText: 'Nobody scored' }
    }

    throw new Error(`BUG: wordiply has no words for a ${mode} game that ended by ${gameEnding.reason}`)
  }

  return { ...makeGameEndingWords(), outcome: playerOutcome }
}
