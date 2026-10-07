// cs-unmet

import type { EndOutcome, GameEnding } from '@/common/ending/gameEnding'
import {
  buildStoppedMessage,
  type EndingMessage,
} from '@/common/ending/endingMessage'

/**
 * What strands says once the game is over, for its ending and mode.
 *
 * `pillText` + `outcome` are the below-board verdict; `infoColText` + `outcome`
 * are the short, bold, color-coded line in the info column. Both come back in
 * one object so the two surfaces cannot disagree.
 *
 * The words come from the game's ending; the outcome is MINE, as the database
 * wrote it (`common.game_players.outcome`), never worked out here. Coop wins by
 * finding every word and loses only to the timer — and its loss counts what was
 * found, never out of how many: the total is part of the answer. Compete is won
 * by whoever solved on the fewest hints, so a loss names the contest that
 * decided it, not the finish order.
 *
 * Call it only when the game HAS ended; it has no answer for a live one.
 */
export function buildGameEndingMessage({
  mode,
  gameEnding,
  playerOutcome,
  nFoundPuzzleWords,
  winnerNames,
  iSolved,
  nMyHints,
  nWinnerHints,
}: {
  mode: 'coop' | 'compete'
  // How the game ended: a solve (`reached_goal`), the timer (`timeout`), the
  // last racer's concession (`conceded`), or a Stop (`neutral`).
  gameEnding: Pick<GameEnding, 'outcome' | 'reason'>
  // How I came out, written with the game's ending.
  playerOutcome: EndOutcome
  // The words found — the team's in coop.
  nFoundPuzzleWords: number
  // Every winner's name, joined with " + " (a tie shares the win).
  winnerNames: string
  iSolved: boolean
  nMyHints: number
  // The hints a race was won on, or null when nobody won.
  nWinnerHints: number | null
}): EndingMessage {
  /** The texts, for the game's ending and whether it went my way. */
  function makeGameEndingWords(): Omit<EndingMessage, 'outcome'> {
    // A Stop is the uniform neutral ending shared with the other games — the
    // shared message owns its words.
    if (gameEnding.outcome === 'neutral') return buildStoppedMessage(mode)

    if (mode === 'coop') {
      if (gameEnding.outcome === 'won') {
        return { pillText: 'Won: every word found', infoColText: 'You found them all!' }
      }
      return { pillText: `Lost: out of time — ${nFoundPuzzleWords} found`, infoColText: 'Out of time' }
    }

    if (gameEnding.outcome === 'won' && playerOutcome === 'won') {
      return { pillText: 'Won: fewest hints', infoColText: 'You win!' }
    } else if (gameEnding.outcome === 'won') {
      // Three ways to lose, and the verdict names the one that happened: the
      // winner beat you on hints; they MATCHED your hints and the earlier solve
      // broke the tie (saying "fewer hints" there would be flatly false); or you
      // never solved at all.
      const pillText = !iSolved
        ? `Lost: ${winnerNames} solved it`
        : nMyHints === nWinnerHints
          ? `Lost: ${winnerNames} solved it sooner`
          : `Lost: ${winnerNames} used fewer hints`
      return { pillText, infoColText: `${winnerNames} won` }
    }
    return { pillText: 'Lost: nobody solved it', infoColText: 'Nobody solved it' }
  }

  return { ...makeGameEndingWords(), outcome: playerOutcome }
}
