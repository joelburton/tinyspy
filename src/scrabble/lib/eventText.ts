// cs-unmet

import type { GEvent } from '../types'

/**
 * What a logged turn did, in the words a reader reads it back in — the board
 * viewer's banner and the printed log both, so the two places a player reads a
 * turn back cannot disagree. Leads with nobody: each reader puts the player in
 * front its own way.
 *
 * A word reads "+10 APPLE, BERRY"; the rest read as what happened ("passed",
 * "exchanged 3 tiles", "exchanged 3 tiles, -5" in a coop game whose swaps
 * cost, "-7 for 3 tiles left", "+7 for going out"). The words
 * are stored lowercase and capitalized here, since a sentence is where CSS
 * cannot reach.
 */
export function makeEventText(event: GEvent): string {
  switch (event.kind) {
    case 'word':
      return `+${event.score!} ${event.words!.map((w) => w.toUpperCase()).join(', ')}`
    case 'exchange':
      return `exchanged ${event.nTiles!} tiles${swapCostText(event)}`
    case 'pass':
      return 'passed'
    case 'leftovers':
      return `${event.score!} for ${event.nTiles!} ${event.nTiles === 1 ? 'tile' : 'tiles'} left`
    case 'went_out':
      return `+${event.score!} for going out`
  }
}

/** A coop swap's cost, ", -5", after the exchange's words; nothing for a free
 *  swap or a compete one, whose row has no score. */
export function swapCostText(event: GEvent): string {
  return event.score ? `, ${event.score}` : ''
}
