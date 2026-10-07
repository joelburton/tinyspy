// cs-unmet

import { makeEndingLabelWord, type EndingLabel } from '@/common/ending/endingLabel'
import type { GameEndedReason } from '@/common/ending/gameEnding'
import type { PlayerRaw } from '@/common/game-page/gameData'

/**
 * How one setgame player came out, or null while they still play: the common
 * type and word, and what setgame adds after the word.
 *
 * Coop wins by emptying the deck with no set left on the table ("deck
 * emptied"); a full clear, no tile left at all, says so ("perfect clear"). The
 * timer stopping first is a loss. Compete ranks by sets found when the deck
 * empties or the timer stops, with no tiebreak, so a tie is an ordinary result
 * and names the others at the same place ("tied with bea"). A player with no
 * sets has no place.
 */
export function makeEndingLabel(
  player: Pick<PlayerRaw, 'outcome' | 'conceded' | 'finalRanking' | 'solved' | 'stillPlaying' | 'ending'>,
  game: {
    mode: 'coop' | 'compete'
    ended: boolean
    reason: GameEndedReason | null
    // No tile left on the table: a coop win's full clear.
    isPerfectClear: boolean
  },
  // The other players ranked at this player's place, by name; empty for none.
  tiedWithNames: string[],
): EndingLabel | null {
  if (player.stillPlaying) return null
  const endedBy = game.ended ? 'game' : 'player'
  const result = makeEndingLabelWord(player, game)!
  const base = { ...result, outcome: player.outcome!, endedBy } as const
  const tie = game.mode === 'compete' && tiedWithNames.length > 0
    ? `tied with ${joinNames(tiedWithNames)}`
    : ''

  switch (result.labelType) {
    case 'won': {
      const rest = game.mode === 'coop'
        ? (game.isPerfectClear ? 'perfect clear' : 'deck emptied')
        : tie
      return { ...base, long: rest, pill: rest }
    }
    case 'placed':
      return { ...base, long: tie, pill: tie }
    case 'stopped':
      return { ...base, long: '', pill: game.mode === 'coop' ? '' : 'no winner' }
    case 'conceded': {
      const rest = game.ended ? '' : 'game continues'
      return { ...base, long: rest, pill: rest }
    }
    case 'lost': {
      // Coop loses only to the timer; a compete player unranked without
      // conceding found no set.
      const rest = game.mode === 'coop' ? 'out of time' : 'no sets found'
      return { ...base, long: rest, pill: rest }
    }
    default:
      throw new Error(`BUG: setgame never ends a player ${result.labelType}`)
  }
}

/** Names as one phrase: "bea", "bea & cade", "bea, cade & dee". */
function joinNames(names: string[]): string {
  if (names.length <= 1) return names.join('')
  return `${names.slice(0, -1).join(', ')} & ${names.at(-1)}`
}
