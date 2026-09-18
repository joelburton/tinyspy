// cs-audited-terminal

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
 * **Won trumps everything**, then a conceder "quit", and anyone else who did
 * not win "lost" — beaten to the win, or eliminated. The precedence is the
 * branch order and matters: a player can be flagged `conceded` and still hold a
 * winning `result` (they conceded a race someone had already ended), and that
 * reads as Won.
 *
 * A missing member reads as 'Lost': a peer we cannot resolve did not win.
 */
export function terminalOutcomeVerb(member: GamePlayer | undefined): 'Won' | 'Quit' | 'Lost' {
  if (member?.result?.won === true) return 'Won'
  if (member?.conceded) return 'Quit'
  return 'Lost'
}
