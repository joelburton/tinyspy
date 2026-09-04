// cs-blessed-game-lib

import type { GamePlayer } from './member'

/**
 * How one player's game ENDED, as the word the OpponentStrip prints.
 *
 * Reach for this when rendering a terminal readout for a single player:
 * several games format it as `${terminalOutcomeVerb(p)} at ${value}` ("Won at 40",
 * "Won at Genius") or `${terminalOutcomeVerb(p)} · ${value}` (scrabble). Each game
 * keeps its own separator and value, which genuinely differ; the verb is the
 * part that must not.
 *
 * Kept OUT of `member.ts` deliberately. That file is types-only so its 103
 * importers erase at runtime, and this is a value — putting it there would give
 * every one of those imports a runtime half it does not want.
 */

/**
 * The capitalized past-tense verb for a player's terminal outcome.
 *
 * **Won trumps everything**, then a conceder "quit", and anyone else who did
 * not win "lost" — beaten to the win, or eliminated. The precedence is the
 * branch order and matters: a player can be flagged `conceded` and still hold a
 * winning `result` (they conceded a race someone had already ended), and that
 * reads as Won.
 *
 * A missing member reads as 'Lost': a peer we cannot resolve did not win.
 *
 * **One function, not two.** This used to compute `'won' | 'quit' | 'lost'` and
 * then immediately re-split the same three cases to capitalize them (Joel,
 * 2026-09-03: *"changing them to 'lost'/'won'/etc only to immediate turn to
 * 'Lost'/'Won' seems silly"*). Nothing ever read the lowercase form — it looked
 * like the app's outcome vocabulary but is not it: that one is the seven words
 * in `lib/outcomes.ts`, and `quit` is not among them. See
 * plans/areas/game-lib.md → `F-game-lib-9`.
 */
export function terminalOutcomeVerb(member: GamePlayer | undefined): 'Won' | 'Quit' | 'Lost' {
  if (member?.result?.won === true) return 'Won'
  if (member?.conceded) return 'Quit'
  return 'Lost'
}
