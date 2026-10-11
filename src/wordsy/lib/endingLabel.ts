// cs-unmet

import { makeEndingLabelWord, type EndingLabel } from '@/common/ending/endingLabel'
import type { GameEndedReason } from '@/common/ending/gameEnding'
import type { PlayerRaw } from '@/common/game-page/gameData'
import type { GTeam } from '../types'

/**
 * How one wordsy player came out, or null while they still play: the common
 * type and word, and what wordsy adds after the word.
 *
 * Compete: seven rounds end the game, ranked by total with no tiebreak, so a
 * tie is an ordinary result and names the others at the same place ("Won
 * (tied with bea)"). A player who scored nothing has no place ("Lost (no
 * points)"). A conceder is out while the others play on.
 *
 * Coop: the team comes out as one, with the card's title ("Won (Wordsmith)"),
 * or under 90 the total and the first title's bar ("Lost (82 pts · 90 for
 * Wordprentice)").
 */
export function makeEndingLabel(
  player: Pick<PlayerRaw, 'outcome' | 'conceded' | 'finalRanking' | 'solved' | 'stillPlaying'>,
  game: {
    mode: 'coop' | 'compete'
    ended: boolean
    reason: GameEndedReason | null
    // The team's total and title in coop; null in compete.
    team: Pick<GTeam, 'total' | 'title'> | null
  },
  // The other players ranked at this player's place, by name; empty for none.
  tiedWithNames: string[],
): EndingLabel | null {
  const result = makeEndingLabelWord(player, game)
  if (result === null) return null
  const base = { ...result, outcome: player.outcome!, endedBy: game.ended ? 'game' : 'player' } as const
  const tie = tiedWithNames.length > 0 ? `tied with ${joinNames(tiedWithNames)}` : ''

  switch (result.labelType) {
    case 'won': {
      // The coop win is the title; the total is the sheet's and the strip's.
      const rest = game.team === null ? tie : game.team.title!
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
      // In compete, ranked players are won or placed and a conceder is
      // conceded, so a loss left over is a player who finished with nothing.
      // In coop the team fell short of the first title.
      const rest = game.team === null ? 'no points' : `${game.team.total} pts · 90 for Wordprentice`
      return { ...base, long: rest, pill: rest }
    }
    default:
      throw new Error(`BUG: wordsy never ends a player ${result.labelType}`)
  }
}

/** Names as one phrase: "bea", "bea & cade", "bea, cade & dee". */
function joinNames(names: string[]): string {
  if (names.length <= 1) return names.join('')
  return `${names.slice(0, -1).join(', ')} & ${names.at(-1)}`
}
