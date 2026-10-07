// cs-unmet

import { makeEndingLabelWord, type EndingLabel } from '@/common/ending/endingLabel'
import type { GameEndedReason } from '@/common/ending/gameEnding'
import type { PlayerRaw } from '@/common/game-page/gameData'

/**
 * How one wordle player came out, or null while they still play: the common
 * type and word, and what wordle adds after the word.
 *
 * Coop wins by solving ("solved it") and loses to the guesses or the timer.
 * Compete ranks the players who solved by the fewest guesses, then the earlier
 * solve, so a place below first says which lost it: "more guesses" when
 * someone above used fewer, "solved later" when they used as many. A solver
 * waits on the rest until the game ends; a player with no place says what ran
 * out.
 */
export function makeEndingLabel(
  player: Pick<PlayerRaw, 'outcome' | 'conceded' | 'finalRanking' | 'solved' | 'stillPlaying' | 'ending'> & {
    nGuessesUsed: number
  },
  game: {
    mode: 'coop' | 'compete'
    ended: boolean
    reason: GameEndedReason | null
  },
  // The fewest guesses any player ranked above this one used; null when none is.
  fewestGuessesAhead: number | null,
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
        fewestGuessesAhead !== null && fewestGuessesAhead < player.nGuessesUsed ? 'more guesses' : 'solved later',
      )
    case 'solved':
      return withDetail('waiting on the rest')
    case 'stopped':
      return { ...base, long: '', pill: game.mode === 'coop' ? '' : 'no winner' }
    case 'conceded':
      return withDetail(game.ended ? '' : 'game continues')
    case 'lost': {
      // My own guesses spent (compete), the team's (coop), or the timer.
      const isOutOfGuesses = player.ending?.reason === 'resource_exhausted' || game.reason === 'resource_exhausted'
      return withDetail(isOutOfGuesses ? 'out of guesses' : game.reason === 'timeout' ? 'out of time' : '')
    }
    default:
      throw new Error(`BUG: wordle never ends a player ${result.labelType}`)
  }
}

/**
 * The fewest guesses used by the players ranked above this one, or null when
 * none is: what `makeEndingLabel` tells a place's "more guesses" from its
 * "solved later" by.
 */
export function findFewestGuessesAhead(
  player: { finalRanking: number | null },
  players: readonly { finalRanking: number | null; nGuessesUsed: number }[],
): number | null {
  const ahead = players.filter((o) =>
    player.finalRanking !== null && o.finalRanking !== null && o.finalRanking < player.finalRanking)
  return ahead.length === 0 ? null : Math.min(...ahead.map((o) => o.nGuessesUsed))
}
