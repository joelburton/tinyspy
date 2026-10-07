// cs-unmet

import { makeEndingLabelWord, type EndingLabel } from '@/common/ending/endingLabel'
import type { GameEndedReason } from '@/common/ending/gameEnding'
import type { PlayerRaw } from '@/common/game-page/gameData'
import { RANKS } from '@/shared/rank-ladder/rankLadder'

/**
 * How one bee-game player came out, or null while they still play: the common
 * type and word, and what spellingbee and wordwheel add after the word.
 *
 * The goal is the target rank when one is set, else every required word.
 * Reaching it ends the game: the team wins in coop, the one who reached it in
 * compete, and the rest of a compete game are short of it, so `lost`. When the
 * timer stops first, a target game is lost by everyone; without a target,
 * compete ranks by score (ties share, the next place skips; no points, no
 * place) and coop ends with no result — "Ended", which only the game can word.
 */
export function makeBeeEndingLabel(
  player: Pick<PlayerRaw, 'outcome' | 'conceded' | 'finalRanking' | 'solved' | 'stillPlaying' | 'ending'>,
  game: {
    mode: 'coop' | 'compete'
    ended: boolean
    reason: GameEndedReason | null
    // The game's own word for the act: 'target', 'solved', 'timeout', …
    detail: string | null
    // The rank that wins, an index into `RANKS`; null for none.
    targetRankIdx: number | null
  },
): EndingLabel | null {
  if (player.stillPlaying) return null
  const endedBy = game.ended ? 'game' : 'player'

  // A coop game without a target that the timer stopped: no result.
  if (game.ended && game.reason === 'timeout' && player.outcome === 'neutral') {
    return {
      labelType: 'ended', word: 'Ended', long: 'out of time', pill: 'out of time',
      outcome: 'neutral', endedBy,
    }
  }

  const result = makeEndingLabelWord(player, game)!
  const base = { ...result, outcome: player.outcome!, endedBy } as const

  switch (result.labelType) {
    case 'won': {
      const rest = game.detail === 'target' ? `reached ${RANKS[game.targetRankIdx!]}` : ''
      return { ...base, long: rest, pill: rest }
    }
    case 'placed':
      return { ...base, long: '', pill: '' }
    case 'stopped':
      return { ...base, long: '', pill: game.mode === 'coop' ? '' : 'no winner' }
    case 'conceded': {
      const rest = game.ended ? '' : 'game continues'
      return { ...base, long: rest, pill: rest }
    }
    case 'lost': {
      // Beaten to the goal: the club line names who reached it.
      if (game.reason !== 'timeout') return { ...base, long: '', pill: '' }
      // Short of the goal when the timer stopped: out of time with a target;
      // without one, no points, so no place.
      const rest = game.targetRankIdx !== null ? 'out of time' : 'no words found'
      return { ...base, long: rest, pill: rest }
    }
    default:
      throw new Error(`BUG: a bee game never ends a player ${result.labelType}`)
  }
}
