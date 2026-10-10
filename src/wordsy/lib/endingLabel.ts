// cs-unmet

import { makeEndingLabelWord, type EndingLabel } from '@/common/ending/endingLabel'
import type { GameEndedReason } from '@/common/ending/gameEnding'
import type { PlayerRaw } from '@/common/game-page/gameData'

/**
 * How one wordsy player came out, or null while they still play: the common
 * type and word, and what wordsy adds after the word.
 *
 * Seven rounds end the game, ranked by total with no tiebreak, so a tie is an
 * ordinary result and names the others at the same place ("Won (tied with
 * bea)"). A player who scored nothing has no place ("Lost (no points)"). A
 * conceder is out while the others play on.
 */
export function makeEndingLabel(
  player: Pick<PlayerRaw, 'outcome' | 'conceded' | 'finalRanking' | 'solved' | 'stillPlaying'>,
  game: {
    ended: boolean
    reason: GameEndedReason | null
  },
  // The other players ranked at this player's place, by name; empty for none.
  tiedWithNames: string[],
): EndingLabel | null {
  const result = makeEndingLabelWord(player, game)
  if (result === null) return null
  const base = { ...result, outcome: player.outcome!, endedBy: game.ended ? 'game' : 'player' } as const
  const tie = tiedWithNames.length > 0 ? `tied with ${joinNames(tiedWithNames)}` : ''

  switch (result.labelType) {
    case 'won':
    case 'placed':
      return { ...base, long: tie, pill: tie }
    case 'stopped':
      return { ...base, long: '', pill: 'no winner' }
    case 'conceded': {
      const rest = game.ended ? '' : 'game continues'
      return { ...base, long: rest, pill: rest }
    }
    case 'lost':
      // Ranked players are won or placed, and a conceder is conceded: a loss
      // left over is a player who finished with nothing.
      return { ...base, long: 'no points', pill: 'no points' }
    default:
      throw new Error(`BUG: wordsy never ends a player ${result.labelType}`)
  }
}

/** Names as one phrase: "bea", "bea & cade", "bea, cade & dee". */
function joinNames(names: string[]): string {
  if (names.length <= 1) return names.join('')
  return `${names.slice(0, -1).join(', ')} & ${names.at(-1)}`
}
