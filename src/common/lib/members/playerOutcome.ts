// cs-audited-game-lib

import type { GamePlayer } from './member'

/**
 * How one player's game ENDED, in a word — the vocabulary, and the capitalized
 * form the OpponentStrip prints.
 *
 * Reach for `outcomeVerb` when rendering a terminal readout for a single
 * player: several games format it as `${outcomeVerb(p)} at ${value}` ("Won at
 * 40", "Won at Genius") or `${outcomeVerb(p)} · ${value}` (scrabble). Each game
 * keeps its own separator and value, which genuinely differ; the verb is the
 * part that must not.
 *
 * Kept OUT of `member.ts` deliberately. That file is types-only so its 103
 * importers erase at runtime, and these two are values — putting them there
 * would give every one of those imports a runtime half it does not want.
 */

/** Outcome verb for one player at game-over, from their common
 *  end-state. Won trumps everything; a conceder "quit"; anyone else
 *  who didn't win "lost" (beaten to the win, or eliminated).
 *
 *  The lowercase vocabulary. `outcomeVerb` below is the presentation every
 *  caller in the app actually renders — see plans/areas/game-lib.md →
 *  `F-game-lib-9` for why this one is exported anyway. */
export function playerOutcome(p: {
  conceded: boolean
  result: Record<string, unknown> | null
}): 'won' | 'quit' | 'lost' {
  if (p.result?.won === true) return 'won'
  if (p.conceded) return 'quit'
  return 'lost'
}

/**
 * The capitalized past-tense verb for a player's terminal outcome — 'Won' / 'Quit'
 * (they conceded) / 'Lost' — for the OpponentStrip's terminal readout, which several
 * games format as `${outcomeVerb(p)} at ${value}` ("Won at 40", "Won at Genius") or
 * `${outcomeVerb(p)} · ${value}` (scrabble). A missing member reads as 'Lost' (a peer
 * we can't resolve didn't win). Lives right next to `playerOutcome` so the strip verbs
 * stay in lockstep with its vocabulary; each game keeps its own separator + value
 * (score / rank), which genuinely differ.
 */
export function outcomeVerb(member: GamePlayer | undefined): 'Won' | 'Quit' | 'Lost' {
  const outcome = member ? playerOutcome(member) : 'lost'
  return outcome === 'won' ? 'Won' : outcome === 'quit' ? 'Quit' : 'Lost'
}
