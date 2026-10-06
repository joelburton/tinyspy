// cs-unmet

import type { PrintHeader } from '@/common/pdf/frame'
import type { TurnRow } from '@/common/pdf/eventLog'
import { makeEventText } from '../lib/eventText'
import type { GCell, GGameData } from '../types'

/** What a scrabble printout contains: the board as it stands, the rack I play
 *  from, and every turn in order. */
export type ScrabblePrintModel = PrintHeader & {
  // The 225 cells, the same the board draws.
  board: GCell[]
  // One row per turn, already in words.
  moves: TurnRow[]
  // The rack I play from: my own in a race, the team's in coop ('?' a blank).
  rack: string[]
  // "Your rack" or "Team rack".
  rackLabel: string
}

/** The printout, from the live game at the moment Print is pressed. What
 *  prints is what my page shows: my own rack, and nobody else's mid-race. */
export function buildPrintModel({ gd, date }: { gd: GGameData; date: string }): ScrabblePrintModel {
  // The summary reads as the state line does.
  const summary = gd.compete
    ? `${gd.me.nBagTiles} tiles in the bag`
    : `Team score: ${gd.me.score} · ${gd.me.nBagTiles} tiles in the bag`

  return {
    brand: gd.brand,
    gameTitle: gd.title,
    date,
    summary,
    setupRows: gd.setupRows,
    mode: gd.mode,
    board: gd.me.board.cells,
    moves: gd.events.map((event, i) => ({ seq: i + 1, who: event.by.username, text: makeEventText(event) })),
    // A racer's own rack is never withheld from them; coop's is the team's.
    rack: gd.me.rack,
    rackLabel: gd.compete ? 'Your rack' : 'Team rack',
  }
}
