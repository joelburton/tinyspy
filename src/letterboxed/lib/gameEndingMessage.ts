// cs-unmet

import type { EndOutcome, GameEnding } from '@/common/ending/gameEnding'
import {
  buildGameEndedMessageNeutral,
  type EndingMessage,
} from '@/common/ending/endingMessage'
import { BOARD_SIZE } from './board'

/**
 * What letterboxed says once the game is over, for its ending and mode.
 *
 * `pillText` + `outcome` are the below-board verdict; `infoColText` + `outcome`
 * are the short, bold, color-coded line in the info column. Both come back in
 * one object so the two surfaces cannot disagree.
 *
 * The words come from the game's ending; the outcome is MINE, as the database
 * wrote it (`common.game_players.outcome`), never worked out here. Coop wins by
 * covering all twelve inside the cap, and loses only to a timeout. Compete's
 * win is FIRST past that same bar, so the race ends on a solve; a timed-out
 * race resolves on the most letters covered, ties sharing the win.
 *
 * Call it only when the game HAS ended; it has no answer for a live one.
 */
export function buildGameEndingMessage({
  mode,
  gameEnding,
  playerOutcome,
  nWordsUsed,
  nCoveredLetters,
  winnerNames,
}: {
  mode: 'coop' | 'compete'
  // How the game ended: a solve (`reached_goal`), the timer (`timeout`), every
  // racer dropping out (`conceded`), or a Stop (`neutral`).
  gameEnding: Pick<GameEnding, 'outcome' | 'reason'>
  // How I came out, written with the game's ending.
  playerOutcome: EndOutcome
  // The chain the verdict is about: the team's in coop, my own in compete.
  nWordsUsed: number
  nCoveredLetters: number
  // Everyone the server ranked first, by name — one on a solve, any number on
  // a tied timeout, none when nobody won.
  winnerNames: string[]
}): EndingMessage {
  const nWords = `${nWordsUsed} ${nWordsUsed === 1 ? 'word' : 'words'}`

  /** The two texts, for the game's ending and whether it went my way. */
  function makeGameEndingWords(): Pick<EndingMessage,'pillText' | 'infoColText'> {
    // A Stop is the uniform neutral ending shared with the other games — the
    // shared message owns its words.
    if (gameEnding.outcome === 'neutral') return buildGameEndedMessageNeutral(mode)

    if (mode === 'coop') {
      if (gameEnding.outcome === 'won') {
        return { pillText: `Won: all twelve in ${nWords}`, infoColText: 'All letters used!' }
      } else if (gameEnding.reason === 'timeout') {
        return {
          pillText: `Lost: out of time at ${nCoveredLetters}/${BOARD_SIZE}`,
          infoColText: 'Out of time',
        }
      }
    } else if (mode === 'compete') {
      if (gameEnding.outcome === 'won') {
        if (gameEnding.reason === 'reached_goal' && playerOutcome === 'won') {
          return { pillText: `Won: all twelve in ${nWords}`, infoColText: 'You got there first!' }
        } else if (gameEnding.reason === 'reached_goal') {
          return {
            pillText: `Lost: ${winnerNames[0] ?? 'a player'} got there first`,
            infoColText: 'Beaten to it',
          }
        } else if (gameEnding.reason === 'timeout' && playerOutcome === 'won') {
          // Exact ties are co-winners: every tied racer is ranked first.
          const covered = `(${nCoveredLetters}/${BOARD_SIZE})`
          return {
            pillText: winnerNames.length > 1
              ? `Won: tied at most letters ${covered}`
              : `Won: most letters ${covered}`,
            infoColText: 'Most letters when time ran out',
          }
        } else if (gameEnding.reason === 'timeout') {
          return {
            pillText: `Lost: ${winnerNames.join(' & ')} covered more`,
            infoColText: 'Out of time',
          }
        }
      } else if (gameEnding.reason === 'conceded') {
        return { pillText: 'Lost: everyone conceded', infoColText: 'Everyone dropped out' }
      } else if (gameEnding.reason === 'timeout') {
        return { pillText: 'Lost: nobody covered the board', infoColText: 'Nobody finished' }
      }
    }

    throw new Error(
      `BUG: letterboxed has no words for a ${mode} ending `
      + `${gameEnding.outcome}/${gameEnding.reason} with player outcome ${playerOutcome}`,
    )
  }

  return { ...makeGameEndingWords(), outcome: playerOutcome }
}
