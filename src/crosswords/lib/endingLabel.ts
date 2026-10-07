// cs-unmet

import { makeEndingLabelWord, type EndingLabel } from '@/common/ending/endingLabel'
import type { GameEndedReason } from '@/common/ending/gameEnding'
import type { PlayerRaw } from '@/common/game-page/gameData'

/**
 * How one crosswords player came out, or null while they still play: the
 * common type and word, and what crosswords adds after the word.
 *
 * Coop's win is worded "Solved", its outcome still won; the timer stopping it
 * first is a loss. Compete is a race: the first to solve wins, a loss to them
 * is the word alone, and the timer with nobody done is a loss for everyone
 * ("out of time").
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
      return game.mode === 'coop' ? { ...withDetail(''), word: 'Solved' } : withDetail('')
    case 'stopped':
      return { ...base, long: '', pill: game.mode === 'coop' ? '' : 'no winner' }
    case 'conceded':
      return withDetail(game.ended ? '' : 'game continues')
    case 'lost':
      // The timer, or (compete) beaten to the solve: the club line names who.
      return withDetail(game.reason === 'timeout' ? 'out of time' : '')
    default:
      throw new Error(`BUG: crosswords never ends a player ${result.labelType}`)
  }
}
