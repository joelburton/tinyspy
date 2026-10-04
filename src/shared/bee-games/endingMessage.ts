// cs-unmet

import type { EndOutcome, GameEndedReason, PlayerEndedReason } from '@/common/terminal/gameEnding'
import { buildGameEndedMessageNeutral, type TerminalMessage } from '@/common/terminal/terminalMessage'
import { RANKS } from '@/shared/rank-ladder/rankLadder'
import type { BeePlayer, BeeStateLineData } from './beeGameData'

/**
 * What a bee game — spellingbee or wordwheel — says once the game is over, for
 * the mode, how it ended, how I came out, and the state line's data.
 *
 * `pillText` + `outcome` are the below-board verdict, `infoColText` + `outcome`
 * the short bold line in the info-column action row. Both come back in one
 * object so the two surfaces cannot disagree. Call it only once the game HAS
 * ended; it has no answer for a live one. No modal carries the verdict — a WIN
 * pops `<CelebrationBlockingModal>` (the team's in coop, the winner's own in a
 * race) and everything else lives in-page.
 *
 * Verdicts lead with the OUTCOME WORD — "Won:" / "Lost:" / "Ended:" — so the
 * result reads before the detail does, and they stay short enough for the
 * below-board pill on a phone (~44 characters; it ellipsizes rather than wraps).
 * A rank that names the GOAL is quoted (`"Genius"`); the rank reached is not.
 *
 * **Coop** (the target rank is optional):
 *   - won     — the team reached the rank it set out for → `Won: "Genius" 47/50 points`
 *   - lost    — the countdown beat an unreached target → `Lost: ran out of time`
 *   - neutral — no target, or they stopped early → `Ended: Solid 10/50 points`
 *     (the rank REACHED, not a target; the same sentence at every rank)
 *
 * **Compete** (a target rank is always set):
 *   - won, and I won → `Won: "Amazing" 47/50 points`
 *   - won, beaten → `● alice won at "Amazing"` — the winner is the message's
 *     `actor`, drawn as the leading mention the way every other peer message
 *     names a person; no "Lost:" prefix, the loss is implicit
 *   - lost, reason `conceded` (everyone dropped) → `Lost: all conceded`
 *   - lost, reason `timeout` → `Lost: ran out of time`
 *   - neutral (a Stop) → the shared `buildGameEndedMessageNeutral('compete')`
 */
export function buildBeeGameEndingMessage({
  mode,
  gameEnding,
  playerOutcome,
  winner,
  stateLineData,
}: {
  mode: 'coop' | 'compete'
  // How the GAME ended (`gd.outcome`, `gd.ending.reason`).
  gameEnding: { outcome: EndOutcome; reason: GameEndedReason }
  // How I came out (`gd.me.outcome`): a compete loser's is `lost` while the
  // game's is `won`.
  playerOutcome: EndOutcome | null
  // The player ranked first (`gd.ending.winner`), or null when nobody was.
  winner: BeePlayer | null
  // What the state line shows: the team's figures in coop, my own in compete.
  stateLineData: BeeStateLineData
}): TerminalMessage {
  const rankName = RANKS[stateLineData.rankIdx]
  const points = `${stateLineData.foundWordsScore}/${stateLineData.reqdWordsScore} points`
  // The rank NAMED in a win is the one they set out for; the score can
  // overshoot it. A coop game with no target cannot be won, so the fallback is
  // for the type alone.
  const targetRankName = RANKS[stateLineData.targetRankIdx ?? stateLineData.rankIdx]

  if (mode === 'compete') {
    if (gameEnding.outcome === 'won') {
      if (playerOutcome === 'won') {
        return { pillText: `Won: "${targetRankName}" ${points}`, infoColText: 'You won!', outcome: 'won' }
      }
      return {
        pillText: `won at "${targetRankName}"`,
        infoColText: `${winner?.username ?? 'a player'} won`,
        outcome: 'lost',
        actor: winner ?? undefined,
      }
    }
    // The two collective losses, told apart by the reason: the last racer
    // dropped out (`common._concede`), or the clock beat everyone to the target.
    if (gameEnding.reason === 'conceded') {
      return { pillText: 'Lost: all conceded', infoColText: 'All conceded', outcome: 'lost' }
    }
    if (gameEnding.reason === 'timeout') {
      return { pillText: 'Lost: ran out of time', infoColText: 'Out of time', outcome: 'lost' }
    }
    // The friends agreed to stop: the shared neutral sentence, like every game's.
    return buildGameEndedMessageNeutral('compete')
  }

  if (gameEnding.outcome === 'won') {
    return { pillText: `Won: "${targetRankName}" ${points}`, infoColText: 'You won!', outcome: 'won' }
  }
  if (gameEnding.outcome === 'lost') {
    // Only reachable with a target set: the countdown beat them to it.
    return { pillText: 'Lost: ran out of time', infoColText: 'Out of time', outcome: 'lost' }
  }
  // The open-ended hunt finishing, or an early stop. Neutral, and the same
  // sentence at every rank (Genius included): they didn't fail at anything.
  return { pillText: `Ended: ${rankName} ${points}`, infoColText: rankName, outcome: 'neutral' }
}

/**
 * What a bee game says to a player who has ended while the others race on,
 * for the reason they ended. Only compete reaches it, and only by conceding:
 * reaching the target ends the game for everyone, and nothing else ends a
 * player on their own. Call it only while the player has ended and the game
 * has not; once the game ends, `buildBeeGameEndingMessage` replaces it.
 */
export function buildBeePlayerEndingMessage({
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
  throw new Error(`BUG: a bee game has no words for a player who ended by ${reason}`)
}
