// cs-unmet

import {
  makeEndingLabelWord,
  type EndingLabel,
} from '@/common/ending/endingLabel'
import type { GameEndedReason } from '@/common/ending/gameEnding'
import type { PlayerRaw } from '@/common/game-page/gameData'

/**
 * How one wordleone player came out, or null while they still play: the common
 * type and word, and what wordleone adds after the word.
 *
 * Coop wins by solving ("solved it") and loses only to the timer: guesses are
 * unlimited, so nothing runs out. Compete ranks the players who solved by the
 * fewest misses, then the earlier solve, so a place below first says which
 * lost it: "more misses" when someone above missed fewer, "solved later" when
 * they missed as many. A solver waits on the rest until the game ends.
 */
export function makeEndingLabel(
  player: Pick<PlayerRaw,
    'outcome' | 'conceded' | 'finalRanking'
    | 'solved' | 'stillPlaying' | 'ending'> & { nMisses: number },
  game: {
    mode: 'coop' | 'compete'
    ended: boolean
    reason: GameEndedReason | null
  },
  // The fewest misses any player ranked above this one made; null when none is.
  fewestMissesAhead: number | null,
): EndingLabel | null {

  if (player.stillPlaying) return null
  const endedBy = game.ended ? 'game' : 'player'
  const result = makeEndingLabelWord(player, game)!
  const base = { ...result, outcome: player.outcome!, endedBy } as const
  const withDetail = (rest: string) => ({ ...base, long: rest, pill: rest })

  switch (result.labelType) {
    case 'won':
      return withDetail(game.mode === 'coop' ? 'solved it' : '')
    case 'placed':
      return withDetail(
        fewestMissesAhead !== null && fewestMissesAhead < player.nMisses
          ? 'more misses'
          : 'solved later',
      )
    case 'solved':
      return withDetail('waiting on the rest')
    case 'stopped':
      return {
        ...base,
        long: '',
        pill: game.mode === 'coop' ? '' : 'no winner',
      }
    case 'conceded':
      return withDetail(game.ended ? '' : 'game continues')
    case 'lost':
      return withDetail(game.reason === 'timeout' ? 'out of time' : '')
    default:
      throw new Error(`BUG: wordleone never ends a player ${result.labelType}`)
  }
}

/**
 * The fewest misses made by the players ranked above this one, or null when
 * none is: what `makeEndingLabel` tells a place's "more misses" from its
 * "solved later" by.
 */
export function findFewestMissesAhead(
  player: { finalRanking: number | null },
  players: readonly { finalRanking: number | null; nMisses: number }[],
): number | null {
  const ahead = players.filter((o) => player.finalRanking !== null
    && o.finalRanking !== null
    && o.finalRanking < player.finalRanking)
  return ahead.length === 0 ? null : Math.min(...ahead.map((o) => o.nMisses))
}
