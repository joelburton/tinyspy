// cs-blessed-spellingbee

import type { Actor } from '@/common/members/member'
import { gameEndedTerminalMessage, type TerminalMessage } from '@/common/terminal/terminalMessage'
import { RANKS } from '@/shared/rank-ladder/rankLadder'

/**
 * What spellingbee says once the game is over, for a play state, a mode, the
 * server's reason and the scores.
 *
 * `pillText` + `outcome` are the below-board verdict, `infoColText` + `outcome`
 * the short bold line in the info-column action row. Both come back in one
 * object so the two surfaces cannot disagree. Call it only when the game IS
 * terminal; it has no answer for a live one.
 * No modal carries the verdict — a WIN pops `<CelebrationBlockingModal>` (the
 * team's in coop, the winner's own in a race) and everything else lives
 * in-page.
 *
 * Verdicts lead with the OUTCOME WORD — "Won:" / "Lost:" / "Ended:" — so the
 * result reads before the detail does, and they stay short enough for the
 * below-board pill on a phone (~44 characters; it ellipsizes rather than wraps).
 * A rank that names the GOAL is quoted (`"Genius"`); the rank reached is not.
 *
 * **Coop** (the target rank is optional — see `SpellingbeeSetup.target_rank`):
 *   - `won`   — the team reached the rank they set out for → `Won: "Genius" 47/50 points`
 *   - `lost`  — the countdown beat an unreached target → `Lost: ran out of time`
 *   - `ended` — no target, or they stopped early → `Ended: Solid 10/50 points`
 *     (the rank REACHED, not a target; the same sentence at every rank)
 *
 * **Compete** (a target rank is always set):
 *   - `won_compete`, caller won → `Won: "Amazing" 47/50 points`
 *   - `won_compete`, beaten → `● alice won at "Amazing"` — the winner is the
 *     message's `actor`, drawn as the leading mention the way every other
 *     peer message names a person; no "Lost:" prefix, the loss is implicit
 *   - `lost_compete` + reason `conceded` (everyone dropped) → `Lost: all conceded`
 *   - `lost_compete` + reason `timeout` → `Lost: ran out of time`
 *   - `ended` + reason `manual` → the shared `gameEndedTerminalMessage('compete')` → `Game ended — no winner`
 */
export function buildTerminalMessage({
  mode,
  playState,
  reason,
  winnerId,
  winner,
  targetRankIdx,
  foundWordsScore,
  requiredWordsScore,
  selfRankIdx,
  selfId,
}: {
  mode: 'coop' | 'compete'
  playState: string
  // WHY it ended — `status.reason`, or 'ended' when the status carries none.
  reason: string
  // `status.winner_user_id`, or null.
  winnerId: string | null
  // The winner's identity, when the roster knows them.
  winner: Actor | undefined
  // From `setup.target_rank`: always set in compete, optional in coop (null =
  // the open-ended hunt, which has no win condition).
  targetRankIdx: number | null
  foundWordsScore: number
  requiredWordsScore: number
  selfRankIdx: number
  selfId: string
}): TerminalMessage {
  const rankName = RANKS[selfRankIdx]
  const points = `${foundWordsScore}/${requiredWordsScore} points`

  if (mode === 'compete') {
    // Always set in a race; the fallback is for the type alone.
    const targetRankName = RANKS[targetRankIdx ?? 6]

    if (playState === 'won_compete') {
      if (winnerId === selfId) {
        return {
          pillText: `Won: "${targetRankName}" ${points}`,
          infoColText: 'You won!',
          outcome: 'won',
        }
      }
      return {
        pillText: `won at "${targetRankName}"`,
        infoColText: `${winner?.username ?? 'a player'} won`,
        outcome: 'lost',
        actor: winner,
      }
    }

    // What's left in compete is the two collective losses — both land on
    // play_state 'lost_compete' — and manual ('ended'). The play_state can't
    // tell the losses apart, so all three key on `reason`: 'conceded' (the
    // last racer dropped, via common.concede), 'timeout' (the clock beat
    // everyone to the target), or 'manual'. The clock and attrition are
    // losses; agreeing to stop isn't.
    if (reason === 'conceded') {
      return {
        pillText: 'Lost: all conceded',
        infoColText: 'All conceded',
        outcome: 'lost',
      }
    }
    if (reason === 'timeout') {
      return {
        pillText: 'Lost: ran out of time',
        infoColText: 'Out of time',
        outcome: 'lost',
      }
    }
    // The shared neutral manual-end message, like every other game — the
    // friends agreed to stop, and that sentence isn't per-game.
    return gameEndedTerminalMessage('compete')
  }

  // ─── coop ───
  if (playState === 'won') {
    // The rank NAMED is the one they set out for; the score can overshoot it.
    const targetRankName = RANKS[targetRankIdx ?? selfRankIdx]
    return {
      pillText: `Won: "${targetRankName}" ${points}`,
      infoColText: 'You won!',
      outcome: 'won',
    }
  }
  if (playState === 'lost') {
    // Only reachable with a target set: the countdown beat them to it.
    return {
      pillText: 'Lost: ran out of time',
      infoColText: 'Out of time',
      outcome: 'lost',
    }
  }
  // 'ended' — the open-ended hunt finishing, or an early stop. Neutral, and the
  // same sentence at every rank (Genius included): they didn't fail at anything.
  return {
    pillText: `Ended: ${rankName} ${points}`,
    infoColText: rankName,
    outcome: 'neutral',
  }
}
