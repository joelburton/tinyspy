// cs-unmet

import { makeEndingLabelWord, type EndingLabel } from '@/common/ending/endingLabel'
import type { GameEndedReason } from '@/common/ending/gameEnding'
import type { PlayerRaw } from '@/common/game-page/gameData'

/**
 * How one waffle player came out, or null while they still play: the common
 * type and word, and what waffle adds after the word.
 *
 * Coop wins by solving, said against par ("par", "par +2"), and loses to the
 * swaps or the timer. Compete ranks the players who solved by the fewest
 * swaps, then the earlier solve, so a place below first says which lost it:
 * "more swaps" when someone above used fewer, "solved later" when they used as
 * many. A solver waits on the rest until the game ends; a player with no place
 * says what ran out.
 */
export function makeEndingLabel(
  player: Pick<PlayerRaw, 'outcome' | 'conceded' | 'finalRanking' | 'solved' | 'stillPlaying' | 'ending'> & {
    nSwapsUsed: number
  },
  game: {
    mode: 'coop' | 'compete'
    ended: boolean
    reason: GameEndedReason | null
    // The deal's par.
    parSwaps: number
  },
  // The fewest swaps any player ranked above this one used; null when none is.
  fewestSwapsAhead: number | null,
): EndingLabel | null {
  if (player.stillPlaying) return null
  const endedBy = game.ended ? 'game' : 'player'
  const result = makeEndingLabelWord(player, game)!
  const base = { ...result, outcome: player.outcome!, endedBy } as const
  const withDetail = (rest: string) => ({ ...base, long: rest, pill: rest })

  switch (result.labelType) {
    case 'won':
      return withDetail(game.mode === 'coop' ? formatPar(player.nSwapsUsed - game.parSwaps) : '')
    case 'placed':
      return withDetail(
        fewestSwapsAhead !== null && fewestSwapsAhead < player.nSwapsUsed ? 'more swaps' : 'solved later',
      )
    case 'solved':
      return withDetail('waiting on the rest')
    case 'stopped':
      return { ...base, long: '', pill: game.mode === 'coop' ? '' : 'no winner' }
    case 'conceded':
      return withDetail(game.ended ? '' : 'game continues')
    case 'lost': {
      // My own swaps spent (compete), the team's (coop), or the timer.
      const isOutOfSwaps = player.ending?.reason === 'resource_exhausted' || game.reason === 'resource_exhausted'
      return withDetail(isOutOfSwaps ? 'out of swaps' : game.reason === 'timeout' ? 'out of time' : '')
    }
    default:
      throw new Error(`BUG: waffle never ends a player ${result.labelType}`)
  }
}

/**
 * The fewest swaps used by the players ranked above this one, or null when
 * none is: what `makeEndingLabel` tells a place's "more swaps" from its
 * "solved later" by.
 */
export function findFewestSwapsAhead(
  player: { finalRanking: number | null },
  players: readonly { finalRanking: number | null; nSwapsUsed: number }[],
): number | null {
  const ahead = players.filter((o) =>
    player.finalRanking !== null && o.finalRanking !== null && o.finalRanking < player.finalRanking)
  return ahead.length === 0 ? null : Math.min(...ahead.map((o) => o.nSwapsUsed))
}

/** Swaps against par: "par", "par +2" — and, should it ever happen, "par −1". */
function formatPar(nSwapsOverPar: number): string {
  if (nSwapsOverPar === 0) return 'par'
  return nSwapsOverPar > 0 ? `par +${nSwapsOverPar}` : `par −${-nSwapsOverPar}`
}
