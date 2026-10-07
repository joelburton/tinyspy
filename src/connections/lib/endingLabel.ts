// cs-unmet

import { makeEndingLabelWord, type EndingLabel } from '@/common/ending/endingLabel'
import type { GameEndedReason } from '@/common/ending/gameEnding'
import type { PlayerRaw } from '@/common/game-page/gameData'

/**
 * How one connections player came out, or null while they still play: the
 * common type and word, and what connections adds after the word.
 *
 * A win, and a loss to someone who found all four first, are the word alone.
 * Every other loss says what ran out: "out of mistakes", the player's own (or
 * in coop the team's) four spent, or "out of time" when the timer stopped
 * them first.
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
      return withDetail('')
    case 'stopped':
      return { ...base, long: '', pill: game.mode === 'coop' ? '' : 'no winner' }
    case 'conceded':
      return withDetail(game.ended ? '' : 'game continues')
    case 'lost':
      return withDetail(makeLossDetail(player, game))
    default:
      throw new Error(`BUG: connections never ends a player ${result.labelType}`)
  }
}

/** What ran out for a player who lost; empty when someone else found all four
 *  first. */
function makeLossDetail(
  player: Pick<PlayerRaw, 'ending'>,
  game: { mode: 'coop' | 'compete'; reason: GameEndedReason | null },
): string {
  // My own four mistakes, spent before the game ended (compete).
  if (player.ending?.reason === 'resource_exhausted') return 'out of mistakes'
  if (game.reason === 'resource_exhausted') return 'out of mistakes'
  if (game.reason === 'timeout') return 'out of time'
  // Beaten to it: the club line names who.
  return ''
}
