// cs-audited-terminal

import type { GamePlayer } from '../members/member'

/**
 * How one player's game ENDED, as the past-tense verb the compete strip's cell
 * prints.
 *
 * Reach for this when rendering a terminal readout for a single player: games
 * format it as `${terminalOutcomeVerb(p)} at ${value}` ("Won at 40", "Won at
 * Genius") or `${terminalOutcomeVerb(p)} · ${value}` ("Won · 12"). Each game
 * keeps its own separator and value, which genuinely differ; the verb is the
 * part that must not.
 *
 * It lives here rather than beside `GamePlayer` because `member.ts` is
 * types-only, for the reason that file's own docstring gives.
 *
 * **Won trumps everything**, then a conceder "quit", and anyone else who did
 * not win "lost" — beaten to the win, or eliminated. The precedence is the
 * branch order and matters: a player can be flagged `conceded` and still hold a
 * winning `result` (they conceded a race someone had already ended), and that
 * reads as Won.
 *
 * A missing member reads as 'Lost': a peer we cannot resolve did not win.
 *
 * **The capitalized word is the only form.** A lowercase `'won' | 'quit' |
 * 'lost'` would look like the app's outcome vocabulary and is not it — that one
 * is the seven words in `common/outcomes/outcomes.ts`, and `quit` is not among
 * them — so there is no intermediate to split on, and the strip's word is
 * computed once, here.
 */
export function terminalOutcomeVerb(member: GamePlayer | undefined): 'Won' | 'Quit' | 'Lost' {
  if (member?.result?.won === true) return 'Won'
  if (member?.conceded) return 'Quit'
  return 'Lost'
}
