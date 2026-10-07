// cs-unmet

import { makeEndingLabelWord, type EndingLabel } from '@/common/ending/endingLabel'
import type { GameEndedReason } from '@/common/ending/gameEnding'
import type { PlayerRaw } from '@/common/game-page/gameData'

/** A loss's cause, per the ending's detail: an assassin, a bystander in sudden
 *  death (the turn budget spent; "turns", the rulebook's timer tokens), or the
 *  timer. */
const LOSS_CAUSE: Record<string, string> = {
  assassin: 'assassin',
  neutral: 'out of turns',
  timeout: 'out of time',
}

/**
 * How one codenamesduet player came out — the team's, since Duet is won and
 * lost together — or null while they play: the common type and word, and the
 * loss's cause after it. A win is the word alone: it is always all fifteen
 * agents.
 */
export function makeEndingLabel(
  player: Pick<PlayerRaw, 'outcome' | 'conceded' | 'finalRanking' | 'solved' | 'stillPlaying' | 'ending'>,
  game: {
    ended: boolean
    reason: GameEndedReason | null
    // The game's own word for the act: 'solved', 'assassin', 'neutral', 'timeout'.
    detail: string | null
  },
): EndingLabel | null {
  if (player.stillPlaying) return null
  const endedBy = game.ended ? 'game' : 'player'
  const result = makeEndingLabelWord(player, game)!
  const base = { ...result, outcome: player.outcome!, endedBy } as const

  switch (result.labelType) {
    case 'won':
    case 'stopped':
      return { ...base, long: '', pill: '' }
    case 'lost': {
      // A loss whose cause nobody wrote a case for is still a loss.
      const rest = LOSS_CAUSE[game.detail ?? ''] ?? ''
      return { ...base, long: rest, pill: rest }
    }
    default:
      throw new Error(`BUG: codenamesduet never ends a player ${result.labelType}`)
  }
}
