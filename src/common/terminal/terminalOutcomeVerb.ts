// cs-blessed-terminal

import type { GamePlayer } from '../members/member'

/**
 * How one player's game ENDED, as the past-tense verb the compete strip's cell
 * prints.
 *
 * Reach for this when rendering a terminal readout for a single player. The
 * common shape is `${terminalOutcomeVerb(p)} at ${value}` — "Won at 40", "Won
 * at Genius" — and a game whose cell leads with the number instead can carry
 * the verb behind it as an annotation, lowercased there ("260 (lost)"). Mind
 * the separator either way: the strip puts `·` BETWEEN players, so a cell that
 * also joins with `·` makes one mark do two jobs. The value, the order and the
 * separator are each game's; the verb is the part that must not differ.
 *
 * **Won trumps everything**, then a conceder "conceded", and anyone else who did
 * not win "lost" — beaten to the win, ranked below first, or eliminated. Won is
 * the player's `outcome`, final once the game ends; a conceder is never ranked,
 * so the order only says which question is asked first.
 *
 * A missing member reads as 'Lost': a peer we cannot resolve did not win.
 */
export function terminalOutcomeVerb(member: GamePlayer | undefined): 'Won' | 'Conceded' | 'Lost' {
  if (member?.outcome === 'won') return 'Won'
  if (member?.player_ended_reason === 'conceded') return 'Conceded'
  return 'Lost'
}
