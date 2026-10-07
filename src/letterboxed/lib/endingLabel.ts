// cs-unmet

import { makeEndingLabelWord, type EndingLabel } from '@/common/ending/endingLabel'
import type { GameEndedReason } from '@/common/ending/gameEnding'
import type { PlayerRaw } from '@/common/game-page/gameData'

/** One player's counts, as the label and its ranking read them. */
type GCounts = { nCoveredLetters: number; nWordsUsed: number }

/**
 * How one letterboxed player came out, or null while they still play: the
 * common type and word, and what letterboxed adds after the word.
 *
 * Coop wins by covering all twelve letters, said in words ("3 words"), and
 * loses only to the timer. Compete is a race to cover them; a loss to the
 * first there is the word alone. When the timer stops it first, compete ranks
 * by the most letters covered, then the fewest words, ties sharing: a tie is
 * named after the word ("tied with bea"), a place below first says which lost
 * it ("fewer letters", or "more words" on as many letters), and a player who
 * covered nothing has no place ("no words found").
 */
export function makeEndingLabel(
  player: Pick<PlayerRaw, 'outcome' | 'conceded' | 'finalRanking' | 'solved' | 'stillPlaying' | 'ending'> & GCounts,
  game: {
    mode: 'coop' | 'compete'
    ended: boolean
    reason: GameEndedReason | null
  },
  // The players ranked above this one, and the others at its place by name.
  others: { ahead: GCounts[]; tiedWithNames: string[] },
): EndingLabel | null {
  if (player.stillPlaying) return null
  const endedBy = game.ended ? 'game' : 'player'
  const result = makeEndingLabelWord(player, game)!
  const base = { ...result, outcome: player.outcome!, endedBy } as const
  const withDetail = (rest: string) => ({ ...base, long: rest, pill: rest })

  switch (result.labelType) {
    case 'won':
      if (game.mode === 'coop') return withDetail(`${player.nWordsUsed} ${player.nWordsUsed === 1 ? 'word' : 'words'}`)
      return withDetail(others.tiedWithNames.length > 0 ? `tied with ${joinNames(others.tiedWithNames)}` : '')
    case 'placed': {
      const isBeatenOnLetters = others.ahead.some((o) => o.nCoveredLetters > player.nCoveredLetters)
      return withDetail(isBeatenOnLetters ? 'fewer letters' : 'more words')
    }
    case 'stopped':
      return { ...base, long: '', pill: game.mode === 'coop' ? '' : 'no winner' }
    case 'conceded':
      return withDetail(game.ended ? '' : 'game continues')
    case 'lost':
      // Coop loses only to the timer; at a compete timeout the unranked
      // covered nothing; otherwise someone covered all twelve first.
      if (game.mode === 'coop') return withDetail('out of time')
      return withDetail(game.reason === 'timeout' ? 'no words found' : '')
    default:
      throw new Error(`BUG: letterboxed never ends a player ${result.labelType}`)
  }
}

/**
 * The players ranked above this one, and the names of the others at its own
 * place, from every player's ranking, counts and name.
 */
export function findOthersAtTheEnd(
  player: { id: string; finalRanking: number | null },
  players: readonly ({ id: string; finalRanking: number | null; name: string } & GCounts)[],
): { ahead: GCounts[]; tiedWithNames: string[] } {
  const ranking = player.finalRanking
  if (ranking === null) return { ahead: [], tiedWithNames: [] }
  return {
    ahead: players.filter((o) => o.finalRanking !== null && o.finalRanking < ranking),
    tiedWithNames: players.filter((o) => o.id !== player.id && o.finalRanking === ranking).map((o) => o.name),
  }
}

/** Names as one phrase: "bea", "bea & cade", "bea, cade & dee". */
function joinNames(names: string[]): string {
  if (names.length <= 1) return names.join('')
  return `${names.slice(0, -1).join(', ')} & ${names.at(-1)}`
}
