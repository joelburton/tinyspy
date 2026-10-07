// cs-unmet

import {
  makeEndingLabelWord,
  type EndingLabel,
} from '@/common/ending/endingLabel'
import type { GameEndedReason } from '@/common/ending/gameEnding'
import type { PlayerRaw } from '@/common/game-page/gameData'

/** psychicnum's words for why a player or the game came to an end. */
export const REASON_DETAIL: Partial<Record<GameEndedReason, string>> = {
  resource_exhausted: 'out of guesses',
  timeout: 'out of time',
  conceded: 'all conceded',
}

/**
 * How one psychicnum player came out, or null while they still play: the
 * common type and word, and what psychicnum adds after the word.
 *
 * psychicnum is a race in compete — the first to find all three secrets wins
 * and the game ends there — so nobody is placed below first, and nobody is out
 * of play with a result still to come: a player ends early only by conceding
 * or spending their guesses, both `lost`.
 */
export function makeEndingLabel(
  player: Pick<PlayerRaw, 'outcome' | 'conceded' | 'finalRanking' | 'solved' | 'stillPlaying' | 'ending'>,
  game: {
    mode: 'coop' | 'compete';
    ended: boolean;
    reason: GameEndedReason | null
  },
): EndingLabel | null {
  const result = makeEndingLabelWord(player, game)
  if (result === null) return null
  // The reason that ended it for this player: the game's once it has ended,
  // else their own.
  const reason = game.ended ? game.reason! : player.ending!.reason
  const base = {
    ...result,
    outcome: player.outcome!,
    endedBy: game.ended ? 'game' : 'player',
  } as const

  switch (result.labelType) {
    case 'won':
      return {
        ...base,
        long: '',
        pill: game.mode === 'coop' ? 'all found' : 'the race',
      }
    case 'stopped':
      return {
        ...base,
        long: '',
        pill: game.mode === 'coop' ? '' : 'no winner',
      }
    case 'conceded': {
      const rest = game.ended ? '' : 'race continues'
      return { ...base, long: rest, pill: rest }
    }
    case 'lost': {
      // A race lost to the winner: the club line names the winner beside it.
      if (game.ended && reason === 'reached_goal') {
        return { ...base, long: '', pill: 'beaten to the punch' }
      }
      // A reason this bundle has no words for — a newer server than this tab —
      // shows raw: visibly wrong, never a crash on the club list.
      const detail = REASON_DETAIL[reason] ?? reason
      return { ...base, long: detail, pill: detail }
    }
    default:
      throw new Error(`BUG: psychicnum never ends a player ${result.labelType}`)
  }
}
