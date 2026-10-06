// cs-unmet

import type { EndOutcome, GameEndedReason } from '@/common/terminal/gameEnding'
import {
  buildGameEndedMessageNeutral,
  type TerminalMessage,
} from '@/common/terminal/terminalMessage'

/**
 * What setgame says once the game is over, for its ending and mode.
 *
 * `pillText` + `outcome` are the below-board verdict; `infoColText` + `outcome`
 * are the short, bold, color-coded line in the info column. Both come back in
 * one object so the two surfaces cannot disagree. The outcome is MINE, as the
 * database wrote it (`common.game_players.outcome`), never worked out here.
 *
 * **Coop wins by clearing the deck**, which means no sets left to find — NOT
 * using every tile. Stranding six or nine is the normal ending (a full clear
 * happens in about 2% of games), so the text leads with the sets found and
 * never counts the leftovers as a shortfall; a full clear keeps its own line.
 *
 * **Compete ranks on sets found with no speed tiebreak**, so ties are real and
 * common: every tied player is ranked first, and the text names them all.
 *
 * Call it only when the game HAS ended; it has no answer for a live one.
 */
export function buildGameEndingMessage({
  mode,
  gameOutcome,
  reason,
  playerOutcome,
  nSetsFound,
  nTilesLeft,
  winnerNames,
  nWinnerSets,
}: {
  mode: 'coop' | 'compete'
  // How the game ended, for everyone: won, lost, or `neutral` for a Stop.
  gameOutcome: EndOutcome
  // Why (`common.games.game_ended_reason`) — `conceded` names a race every
  // racer dropped out of.
  reason: GameEndedReason
  // How I came out, written with the game's ending.
  playerOutcome: EndOutcome
  // The sets the table found.
  nSetsFound: number
  // The tiles left on the table: none is a perfect clear.
  nTilesLeft: number
  // Every winner's name — a tie shares the win.
  winnerNames: string[]
  // The sets the winners share, or null when nobody won.
  nWinnerSets: number | null
}): TerminalMessage {
  const sets = `${nSetsFound} ${nSetsFound === 1 ? 'set' : 'sets'}`

  /** The texts, for the game's ending and whether it went my way. */
  function makeGameEndingWords(): Omit<TerminalMessage, 'outcome'> {
    if (mode === 'coop') {
      if (gameOutcome === 'won') {
        return nTilesLeft === 0
          ? { pillText: `Won: the whole deck, ${sets}`, infoColText: 'A perfect clear!' }
          : { pillText: `Won: all sets found, ${sets}`, infoColText: 'All sets found' }
      }
      if (gameOutcome === 'lost') {
        return { pillText: `Lost: out of time, ${sets}`, infoColText: `${sets} found` }
      }
      // A Stop: no verdict, just what the table got.
      return { pillText: `Ended: ${sets}`, infoColText: `${sets} found` }
    }

    if (gameOutcome === 'won') {
      const isShared = winnerNames.length > 1
      const names = winnerNames.join(' & ')
      if (playerOutcome === 'won') {
        return isShared
          ? { pillText: `Won: tied on ${nWinnerSets}`, infoColText: 'You tied for the win!' }
          : { pillText: `Won: ${nWinnerSets} sets`, infoColText: 'You won!' }
      }
      return isShared
        ? { pillText: `${names} tied on ${nWinnerSets}`, infoColText: `${names} tied` }
        : { pillText: `${names} won with ${nWinnerSets}`, infoColText: `${names} won` }
    }
    if (gameOutcome === 'lost') {
      return reason === 'conceded'
        ? { pillText: 'Lost: all conceded', infoColText: 'All conceded' }
        : { pillText: 'Lost: nobody found a set', infoColText: 'Nobody scored' }
    }
    // A Stop is the uniform neutral ending shared with the other games.
    return buildGameEndedMessageNeutral(mode)
  }

  return { ...makeGameEndingWords(), outcome: playerOutcome }
}
