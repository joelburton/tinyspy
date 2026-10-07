// cs-unmet

import { makeEndingLabelWord, type EndingLabel } from '@/common/ending/endingLabel'
import type { GameEndedReason } from '@/common/ending/gameEnding'
import type { PlayerRaw } from '@/common/game-page/gameData'

/** One player's scores, as the label and its ranking read them; null until
 *  the game ends. */
type GScores = { lengthScore: number | null; nLetters: number | null }

/**
 * How one wordiply player came out, or null while they still play: the
 * common type and word, and what wordiply adds after the word.
 *
 * Coop has no win: the team's five words played is no result, said with its
 * length score ("Ended (72%)"), and the timer stopping it first is a loss.
 * Compete ranks the players who scored by the length score, then the letters,
 * then the earlier last word, so a place below first says which lost it:
 * "shorter word", "fewer letters", or "finished later". A player with five
 * words played waits on the rest; one who scored nothing has no place ("no
 * words found").
 */
export function makeEndingLabel(
  player: Pick<PlayerRaw, 'outcome' | 'conceded' | 'finalRanking' | 'solved' | 'stillPlaying' | 'ending'> & GScores,
  game: {
    mode: 'coop' | 'compete'
    ended: boolean
    reason: GameEndedReason | null
  },
  // The players ranked above this one; empty when none is.
  ahead: readonly GScores[],
): EndingLabel | null {
  if (player.stillPlaying) return null
  const endedBy = game.ended ? 'game' : 'player'

  // Coop's five words played: no result, with the team's length score.
  if (game.ended && game.reason === 'resource_exhausted' && game.mode === 'coop') {
    const rest = `${player.lengthScore ?? 0}%`
    return { labelType: 'ended', word: 'Ended', long: rest, pill: rest, outcome: 'neutral', endedBy }
  }

  const result = makeEndingLabelWord(player, game)!
  const base = { ...result, outcome: player.outcome!, endedBy } as const
  const withDetail = (rest: string) => ({ ...base, long: rest, pill: rest })

  switch (result.labelType) {
    case 'won':
      return withDetail('')
    case 'placed':
      return withDetail(findWhatLostThePlace(player, ahead))
    case 'finished':
      return withDetail('waiting on the rest')
    case 'stopped':
      return { ...base, long: '', pill: game.mode === 'coop' ? '' : 'no winner' }
    case 'conceded':
      return withDetail(game.ended ? '' : 'game continues')
    case 'lost':
      // Coop loses only to the timer; a compete player unranked without
      // conceding scored nothing.
      return withDetail(game.mode === 'coop' ? 'out of time' : 'no words found')
    default:
      throw new Error(`BUG: wordiply never ends a player ${result.labelType}`)
  }
}

/** Which step of the ranking put a player below the ones above them. */
function findWhatLostThePlace(player: GScores, ahead: readonly GScores[]): string {
  const score = (n: number | null) => n ?? 0
  if (ahead.some((o) => score(o.lengthScore) > score(player.lengthScore))) return 'shorter word'
  if (ahead.some((o) => score(o.nLetters) > score(player.nLetters))) return 'fewer letters'
  return 'finished later'
}

/** The scores of the players ranked above this one; empty when none is. */
export function findScoresAhead(
  player: { finalRanking: number | null },
  players: readonly ({ finalRanking: number | null } & GScores)[],
): GScores[] {
  const ranking = player.finalRanking
  if (ranking === null) return []
  return players.filter((o) => o.finalRanking !== null && o.finalRanking < ranking)
}
