// cs-unmet

import type { EndOutcome, GameEndedReason, PlayerEndedReason } from '@/common/terminal/gameEnding'
import { buildGameEndedMessageNeutral, type TerminalMessage } from '@/common/terminal/terminalMessage'
import type { GPlayer } from '../types'

/**
 * What boggle says once the game is over, for the mode, how it ended, how I
 * came out, and the tally. Every outcome is the server's (`boggle._finish`
 * ranks the players); this only words it.
 *
 * `pillText` + `outcome` are the below-board verdict, `infoColText` + `outcome`
 * the short bold line in the info column's action row. Call it only once the
 * game HAS ended.
 *
 * **Coop:**
 *   - won     — the team reached its target → `Won: 12 words, 30 points`
 *   - lost    — the timer beat a target → `Lost: …`, "Time's up"
 *   - neutral — no target, or a Stop → `Ended: …`, "Time's up" / "Game ended"
 *
 * **Compete:**
 *   - a Stop → the shared `buildGameEndedMessageNeutral('compete')`
 *   - I conceded → `Lost: conceded`
 *   - I won — first to the target, or the top score when the timer stopped
 *     (a tie for first wins together) → `Won: …`
 *   - somebody else won → `● alice won`, the winner as the message's `actor`
 *   - nobody won: the timer beat a target → `Lost: ran out of time`; or, with
 *     no target, nobody scored → `Lost: no words found`
 */
export function buildGameEndingMessage({
  mode,
  gameEnding,
  playerOutcome,
  conceded,
  winner,
  hasTarget,
  tally,
}: {
  mode: 'coop' | 'compete'
  // How the GAME ended (`gd.outcome`, `gd.ending.reason`).
  gameEnding: { outcome: EndOutcome; reason: GameEndedReason }
  // How I came out (`gd.me.outcome`).
  playerOutcome: EndOutcome | null
  conceded: boolean
  // The player ranked first (`gd.ending.winner`), or null when nobody was.
  winner: GPlayer | null
  // The game was played to a share of the required points.
  hasTarget: boolean
  // "12 words, 30 points" — the team's in coop, my own in compete.
  tally: string
}): TerminalMessage {
  const reasonText = gameEnding.reason === 'timeout' ? "Time's up" : 'Game ended'

  if (mode === 'coop') {
    if (gameEnding.outcome === 'won') {
      return { pillText: `Won: ${tally}`, infoColText: 'Target reached!', outcome: 'won' }
    }
    if (gameEnding.outcome === 'lost') {
      return { pillText: `Lost: ${tally}`, infoColText: reasonText, outcome: 'lost' }
    }
    return { pillText: `Ended: ${tally}`, infoColText: reasonText, outcome: 'neutral' }
  }

  if (gameEnding.reason === 'stopped') return buildGameEndedMessageNeutral('compete')
  if (conceded) {
    return { pillText: 'Lost: conceded', infoColText: 'You conceded', outcome: 'lost' }
  }
  if (playerOutcome === 'won') {
    return { pillText: `Won: ${tally}`, infoColText: 'You won!', outcome: 'won' }
  }
  if (winner !== null) {
    return { pillText: 'won', infoColText: `${winner.username} won`, outcome: 'lost', actor: winner }
  }
  if (hasTarget) {
    return { pillText: 'Lost: ran out of time', infoColText: 'Out of time', outcome: 'lost' }
  }
  return { pillText: 'Lost: no words found', infoColText: 'No winner', outcome: 'lost' }
}

/**
 * What boggle says to a racer who has ended while the others play on. Only
 * compete reaches it, and only by conceding: nothing else ends a player on
 * their own. Once the game ends, `buildGameEndingMessage` replaces it.
 */
export function buildPlayerEndingMessage({
  reason,
  outcome,
}: {
  // Why I ended (`gd.me.ending.reason`).
  reason: PlayerEndedReason
  // How I came out (`gd.me.outcome`), written when I ended.
  outcome: EndOutcome
}): TerminalMessage {
  if (reason === 'conceded') {
    return { pillText: 'Conceded — race continues', infoColText: 'You conceded', outcome }
  }
  throw new Error(`BUG: boggle has no words for a player who ended by ${reason}`)
}
