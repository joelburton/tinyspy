// cs-unmet

import { makeEndingLabelWord, type EndingLabel } from '@/common/ending/endingLabel'
import type { GameEndedReason } from '@/common/ending/gameEnding'
import type { PlayerRaw } from '@/common/game-page/gameData'

/**
 * How one stackdown player came out, or null while they still play: the
 * common type and word, and what stackdown adds after the word.
 *
 * Coop wins by clearing the stack ("stack cleared") and loses only to the
 * timer. Compete is a race: the first to clear it wins, and a loss to them is
 * the word alone; the timer with nobody clear is a loss for everyone ("out of
 * time").
 */
export function makeEndingLabel(
  player: Pick<PlayerRaw, 'outcome' | 'conceded' | 'finalRanking' | 'solved' | 'stillPlaying' | 'ending'>,
  game: {
    mode: 'coop' | 'compete'
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
      return withDetail(game.mode === 'coop' ? 'stack cleared' : '')
    case 'stopped':
      return { ...base, long: '', pill: game.mode === 'coop' ? '' : 'no winner' }
    case 'conceded':
      return withDetail(game.ended ? '' : 'game continues')
    case 'lost':
      // The timer, or (compete) beaten to the clear: the club line names who.
      return withDetail(game.reason === 'timeout' ? 'out of time' : '')
    default:
      throw new Error(`BUG: stackdown never ends a player ${result.labelType}`)
  }
}
