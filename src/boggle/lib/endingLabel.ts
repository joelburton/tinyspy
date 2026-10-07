// cs-unmet

import { makeEndingLabelWord, type EndingLabel } from '@/common/ending/endingLabel'
import type { GameEndedReason } from '@/common/ending/gameEnding'
import type { PlayerRaw } from '@/common/game-page/gameData'

/**
 * How one boggle player came out, or null while they still play: the common
 * type and word, and what boggle adds after the word.
 *
 * The goal is the target when one is set, else every required word. Reaching
 * it ends the game: the team wins in coop, the one who reached it in compete,
 * and the rest of a compete game are short of it, so `lost`. When the timer
 * stops first, a target game is lost by everyone; without a target, compete
 * ranks by score (ties share, the next place skips; no points, no place) and
 * coop ends with no result — "Ended", which only boggle can word. A shared
 * place names the others at it ("tied with bea").
 */
export function makeEndingLabel(
  player: Pick<PlayerRaw, 'outcome' | 'conceded' | 'finalRanking' | 'solved' | 'stillPlaying' | 'ending'>,
  game: {
    mode: 'coop' | 'compete'
    ended: boolean
    reason: GameEndedReason | null
    // The game's own word for the act: 'target', 'solved', 'timeout', …
    detail: string | null
    // The target, as a share of the required words' points; null for none.
    winPercent: number | null
  },
  // The other players ranked at this player's place, by name; empty for none.
  tiedWithNames: string[],
): EndingLabel | null {
  if (player.stillPlaying) return null
  const endedBy = game.ended ? 'game' : 'player'

  // A coop game without a target that the timer stopped: no result.
  if (game.ended && game.reason === 'timeout' && player.outcome === 'neutral') {
    return {
      labelType: 'ended', word: 'Ended', long: 'out of time', pill: 'out of time',
      outcome: 'neutral', endedBy,
    }
  }

  const result = makeEndingLabelWord(player, game)!
  const base = { ...result, outcome: player.outcome!, endedBy } as const
  const tie = game.mode === 'compete' && tiedWithNames.length > 0
    ? `tied with ${joinNames(tiedWithNames)}`
    : ''

  switch (result.labelType) {
    case 'won': {
      const rest = game.detail === 'target' ? `reached ${game.winPercent}%` : tie
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
      // Beaten to the goal: the club line names who reached it.
      if (game.reason !== 'timeout') return { ...base, long: '', pill: '' }
      // Short of the goal when the timer stopped: out of time with a target;
      // without one, no points, so no place.
      const rest = game.winPercent !== null ? 'out of time' : 'no words found'
      return { ...base, long: rest, pill: rest }
    }
    default:
      throw new Error(`BUG: boggle never ends a player ${result.labelType}`)
  }
}

/** Names as one phrase: "bea", "bea & cade", "bea, cade & dee". */
function joinNames(names: string[]): string {
  if (names.length <= 1) return names.join('')
  return `${names.slice(0, -1).join(', ')} & ${names.at(-1)}`
}
