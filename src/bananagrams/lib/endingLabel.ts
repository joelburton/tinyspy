// cs-unmet

import { makeEndingLabelWord, type EndingLabel } from '@/common/ending/endingLabel'
import type { GameEndedReason } from '@/common/ending/gameEnding'
import type { PlayerRaw } from '@/common/game-page/gameData'

/**
 * How one bananagrams player came out, or null while they still play: the
 * common type and word, and what bananagrams adds after the word.
 *
 * A race, compete only: the first to go out wins ("Won (Bananas!)", the call
 * a player makes going out), and a loss to them is the word alone. The timer
 * with nobody out is a loss for everyone ("out of time").
 */
export function makeEndingLabel(
  player: Pick<PlayerRaw, 'outcome' | 'conceded' | 'finalRanking' | 'solved' | 'stillPlaying' | 'ending'>,
  game: {
    ended: boolean
    reason: GameEndedReason | null
  },
): EndingLabel | null {
  if (player.stillPlaying) return null
  const endedBy = game.ended ? 'game' : 'player'
  const result = makeEndingLabelWord(player, game)!
  const base = { ...result, outcome: player.outcome!, endedBy } as const
  const withDetail = (rest: string) => ({ ...base, long: rest, pill: rest })

  switch (result.labelType) {
    case 'won':
      return withDetail('Bananas!')
    case 'stopped':
      return { ...base, long: '', pill: 'no winner' }
    case 'conceded':
      return withDetail(game.ended ? '' : 'game continues')
    case 'lost':
      // The timer, or beaten out: the club line names who went out.
      return withDetail(game.reason === 'timeout' ? 'out of time' : '')
    default:
      throw new Error(`BUG: bananagrams never ends a player ${result.labelType}`)
  }
}
