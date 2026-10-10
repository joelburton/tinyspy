// cs-unmet

import { makeEndingLabelWord, type EndingLabel } from '@/common/ending/endingLabel'
import type { GameEndedReason } from '@/common/ending/gameEnding'
import type { PlayerRaw } from '@/common/game-page/gameData'

/**
 * How one strands player came out, or null while they still play: the common
 * type and word, and what strands adds after the word.
 *
 * Coop wins by finding every word and loses only to the timer. Compete ranks
 * the players who solved by the fewest hints, then the earlier solve, so a
 * place below first says which lost it: "more hints" when someone above used
 * fewer, "solved later" when they used as many. A solver waits on the rest
 * until the game ends; a player who never solved has no place.
 */
export function makeEndingLabel(
  player: Pick<PlayerRaw, 'outcome' | 'conceded' | 'finalRanking' | 'solved' | 'stillPlaying' | 'ending'> & {
    nHintsUsed: number
  },
  game: {
    mode: 'coop' | 'compete'
    ended: boolean
    reason: GameEndedReason | null
  },
  // The fewest hints any player ranked above this one used; null when none is.
  fewestHintsAhead: number | null,
): EndingLabel | null {
  if (player.stillPlaying) return null
  const endedBy = game.ended ? 'game' : 'player'
  const result = makeEndingLabelWord(player, game)!
  const base = { ...result, outcome: player.outcome!, endedBy } as const
  const withDetail = (rest: string) => ({ ...base, long: rest, pill: rest })

  switch (result.labelType) {
    case 'won':
      return withDetail(game.mode === 'coop' ? 'all found' : '')
    case 'placed':
      return withDetail(
        fewestHintsAhead !== null && fewestHintsAhead < player.nHintsUsed ? 'more hints' : 'solved later',
      )
    case 'solved':
      return withDetail('waiting on the rest')
    case 'stopped':
      return { ...base, long: '', pill: game.mode === 'coop' ? '' : 'no winner' }
    case 'conceded':
      return withDetail(game.ended ? '' : 'game continues')
    case 'lost':
      // Coop loses only to the timer; a compete player unranked without
      // conceding never solved.
      return withDetail(game.mode === 'coop' ? 'out of time' : '')
    default:
      throw new Error(`BUG: strands never ends a player ${result.labelType}`)
  }
}

/**
 * The fewest hints used by the players ranked above this one, or null when
 * none is: what `makeEndingLabel` tells a place's "more hints" from its
 * "solved later" by.
 */
export function findFewestHintsAhead(
  player: { finalRanking: number | null },
  players: readonly { finalRanking: number | null; nHintsUsed: number }[],
): number | null {
  const ahead = players.filter((o) =>
    player.finalRanking !== null && o.finalRanking !== null && o.finalRanking < player.finalRanking)
  return ahead.length === 0 ? null : Math.min(...ahead.map((o) => o.nHintsUsed))
}
