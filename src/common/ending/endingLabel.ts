// cs-unmet

import type { EndOutcome, GameEndedReason } from './gameEnding'
import type { PlayerRaw } from '../game-page/gameData'

/**
 * What kind of result a label says. Every place below first is `placed`; the
 * word carries which ("2nd").
 */
export type EndingLabelType =
  | 'won'
  | 'conceded'
  | 'placed'
  | 'stopped'
  | 'solved'
  | 'finished'
  | 'lost'

/**
 * How one player came out — of the game once it has ended, or of their own
 * play while the others go on — with the server's outcome for the color. A
 * game's `makeEndingLabel` builds it, from `makeEndingLabelWord` and its own
 * detail. `long` and `pill` are what follows the word, never the word again, so
 * a surface can set the word apart (bold) and join the two its own way.
 */
export type EndingLabel = {
  labelType: EndingLabelType
  // The bare result: "Won", "Conceded", "2nd", "Stopped", "Solved",
  // "Finished", "Lost". The compete strip shows it.
  word: string
  // What the club line adds after the word, in parentheses: "out of guesses".
  // Empty when the word says it all.
  long: string
  // What the pill adds after the word: "the race". Empty when the word says it
  // all.
  pill: string
  // The server's, as written: the color every surface wears.
  outcome: EndOutcome
  // Which ending this is: the game's, or the player's own while the game goes
  // on.
  endedBy: 'game' | 'player'
}

/**
 * The label's type and word, the same in every game: read from the facts the
 * server writes the same way for all of them — the player's `outcome`,
 * `finalRanking`, conceding and solving, and the game's ending reason. Null
 * while the player still plays.
 *
 * The order decides: won, conceded, placed ("2nd"), stopped, solved, finished,
 * lost. Solved and finished are a player out of play with no result yet, while
 * the game goes on. A `no-result` ending — neutral, not a Stop — is worded by
 * each game from its reason, so it throws here.
 */
export function makeEndingLabelWord(
  player: Pick<PlayerRaw, 'outcome' | 'conceded' | 'finalRanking' | 'solved' | 'stillPlaying'>,
  game: { ended: boolean; reason: GameEndedReason | null },
): { labelType: EndingLabelType; word: string } | null {
  if (player.stillPlaying) return null
  if (player.outcome === 'won') return { labelType: 'won', word: 'Won' }
  if (player.conceded) return { labelType: 'conceded', word: 'Conceded' }
  if (player.outcome === 'near' && player.finalRanking !== null) {
    return { labelType: 'placed', word: formatPlace(player.finalRanking) }
  }
  if (player.outcome === 'neutral') {
    if (game.ended && game.reason === 'stopped') return { labelType: 'stopped', word: 'Stopped' }
    if (game.ended) {
      throw new Error(`BUG: a no-result ending (${game.reason}) is the game's to word`)
    }
    return player.solved
      ? { labelType: 'solved', word: 'Solved' }
      : { labelType: 'finished', word: 'Finished' }
  }
  return { labelType: 'lost', word: 'Lost' }
}

/** A ranking as a place: 2 → "2nd", 3 → "3rd", 11 → "11th", 22 → "22nd". */
function formatPlace(ranking: number): string {
  // 11th, 12th and 13th break the last-digit rule.
  const isTeen = ranking % 100 >= 11 && ranking % 100 <= 13
  const last = ranking % 10
  if (!isTeen && last === 1) return `${ranking}st`
  if (!isTeen && last === 2) return `${ranking}nd`
  if (!isTeen && last === 3) return `${ranking}rd`
  return `${ranking}th`
}
