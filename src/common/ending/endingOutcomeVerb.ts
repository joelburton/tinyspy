// cs-blessed-ending

import type { PlayerRaw } from '../game-page/gameData'

/**
 * How one player's game ENDED, as the word the compete strip's cell prints.
 *
 * Reach for this when rendering an ending readout for a single player. The
 * common shape is `${endingOutcomeVerb(p)} at ${value}` — "Won at 40", "2nd at
 * 31" — and a game whose cell leads with the number instead can carry the word
 * behind it as an annotation, lowercased there ("260 (lost)"). Mind the
 * separator either way: the strip puts `·` BETWEEN players, so a cell that also
 * joins with `·` makes one mark do two jobs. The value, the order and the
 * separator are each game's; the word is the part that must not differ.
 *
 * **Won trumps everything**, then a conceder "Conceded", then a player ranked
 * below first by their place ("2nd"), and anyone else "Lost" — beaten to the
 * win, or eliminated. Each is the server's: the player's `outcome` and
 * `finalRanking`, final once the game ends; a conceder is never ranked, so the
 * order only says which question is asked first.
 */
export function endingOutcomeVerb(
  player: Pick<PlayerRaw, 'outcome' | 'conceded' | 'finalRanking'>,
): string {
  if (player.outcome === 'won') return 'Won'
  if (player.conceded) return 'Conceded'
  if (player.outcome === 'near' && player.finalRanking !== null) {
    return formatPlace(player.finalRanking)
  }
  return 'Lost'
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
