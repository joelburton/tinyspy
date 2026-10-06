// cs-unmet

import type { Actor } from '@/common/members/member'
import type { EndOutcome, GameEndedReason } from '@/common/terminal/gameEnding'
import {
  buildGameEndedMessageNeutral,
  type TerminalMessage,
} from '@/common/terminal/terminalMessage'

/**
 * What scrabble says once the game is over, for its ending and mode.
 *
 * `pillText` + `outcome` are the below-board verdict; `infoColText` + `outcome`
 * are the short, bold, color-coded line in the info column. Both come back in
 * one object so the two surfaces cannot disagree. The outcome is MINE, as the
 * database wrote it (`common.game_players.outcome`), never worked out here.
 *
 * The pill is one or two words, far terser than other games': scrabble's slot
 * is not a full below-board row but the space the commit buttons give up, with
 * the rack still beside it. No score in it either — the mobile status bar
 * above the board carries the live number.
 *
 * **Coop's bag played out is a `won` outcome, drawn green, and says
 * "Completed"**: the score is the point, not a verdict. The clock is the one
 * way a coop table loses.
 *
 * **Compete ranks on the final score**; a tie shares rank 1, so every tied
 * player won, and the text names them all.
 *
 * Call it only when the game HAS ended; it has no answer for a live one.
 */
export function buildGameEndingMessage({
  mode,
  gameOutcome,
  reason,
  playerOutcome,
  teamScore,
  winners,
}: {
  mode: 'coop' | 'compete'
  // How the game ended, for everyone: won, lost, or `neutral` for a Stop.
  gameOutcome: EndOutcome
  // Why (`common.games.game_ended_reason`) — `conceded` names a race every
  // player dropped out of.
  reason: GameEndedReason
  // How I came out, written with the game's ending.
  playerOutcome: EndOutcome
  // Coop's score, the players' sum less the leftovers; null in compete.
  teamScore: number | null
  // Everyone ranked first — a tie shares the win; empty when nobody won.
  winners: Actor[]
}): TerminalMessage {
  /** The texts, for the game's ending and whether it went my way. */
  function makeGameEndingWords(): Omit<TerminalMessage, 'outcome'> {
    // A Stop is the uniform neutral ending shared with the other games.
    if (gameOutcome === 'neutral') return buildGameEndedMessageNeutral(mode)

    if (mode === 'coop') {
      const score = `${teamScore!} pts`
      if (gameOutcome === 'won') return { pillText: 'Completed', infoColText: score }
      return { pillText: 'Lost: out of time', infoColText: score }
    }

    if (gameOutcome === 'lost') {
      // `_finish` ranks everyone who didn't concede, so a race nobody won is
      // one every player conceded.
      if (reason === 'conceded') return { pillText: 'All conceded', infoColText: 'All conceded' }
      throw new Error(`BUG: a scrabble race lost for everyone, ended ${reason}`)
    }
    const isShared = winners.length > 1
    if (playerOutcome === 'won') {
      return isShared
        ? { pillText: 'Tied', infoColText: 'Tied' }
        : { pillText: 'You won', infoColText: 'You won!' }
    }
    if (isShared) {
      const names = winners.map((w) => w.username).join(' & ')
      return { pillText: `${names} won`, infoColText: `${names} won` }
    }
    // The pill draws the winner as its leading mention: "● moth won".
    return { pillText: 'won', infoColText: `${winners[0].username} won`, actor: winners[0] }
  }

  return { ...makeGameEndingWords(), outcome: playerOutcome }
}
