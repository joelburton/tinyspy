// cs-unmet

import { makeEndingLabelWord, type EndingLabel } from '@/common/ending/endingLabel'
import type { GameEndedReason } from '@/common/ending/gameEnding'
import type { PlayerRaw } from '@/common/game-page/gameData'

/**
 * How one scrabble player came out, or null while they still play: the common
 * type and word, and what scrabble adds after the word.
 *
 * Coop wins by playing every tile ("Won (every tile played)"); the timer with
 * tiles left over is no result ("Ended (out of time)"), so a coop table cannot
 * lose. Compete ranks by final score, a tie broken by the score before the
 * leftovers; one that survives it names the others at the same place ("tied
 * with bea"). A player who played no word has no place.
 *
 * The pill is the word alone: scrabble's pill sits in the room the move
 * buttons give up, beside the rack. The detail is the info column's and the
 * club line's.
 */
export function makeEndingLabel(
  player: Pick<PlayerRaw, 'outcome' | 'conceded' | 'finalRanking' | 'solved' | 'stillPlaying' | 'ending'>,
  game: {
    mode: 'coop' | 'compete'
    ended: boolean
    reason: GameEndedReason | null
  },
  // The other players ranked at this player's place, by name; empty for none.
  tiedWithNames: string[],
): EndingLabel | null {
  if (player.stillPlaying) return null
  const endedBy = game.ended ? 'game' : 'player'

  // A coop game the timer stopped, tiles left over: no result.
  if (game.ended && game.reason === 'timeout' && player.outcome === 'neutral') {
    return { labelType: 'ended', word: 'Ended', long: 'out of time', pill: '', outcome: 'neutral', endedBy }
  }

  const result = makeEndingLabelWord(player, game)!
  const base = { ...result, outcome: player.outcome!, endedBy, pill: '' } as const
  const tie = game.mode === 'compete' && tiedWithNames.length > 0
    ? `tied with ${joinNames(tiedWithNames)}`
    : ''

  switch (result.labelType) {
    case 'won':
      return { ...base, long: game.mode === 'coop' ? 'every tile played' : tie }
    case 'placed':
      return { ...base, long: tie }
    case 'stopped':
      return { ...base, long: '' }
    case 'conceded':
      return { ...base, long: game.ended ? '' : 'game continues' }
    case 'lost':
      // Only compete loses, and only a player who played no word is unranked
      // without conceding.
      return { ...base, long: 'no words played' }
    default:
      throw new Error(`BUG: scrabble never ends a player ${result.labelType}`)
  }
}

/** Names as one phrase: "bea", "bea & cade", "bea, cade & dee". */
function joinNames(names: string[]): string {
  if (names.length <= 1) return names.join('')
  return `${names.slice(0, -1).join(', ')} & ${names.at(-1)}`
}
