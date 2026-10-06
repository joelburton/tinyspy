// cs-fixed-outcome-fix

import type { PrintHeader } from '@/common/pdf/frame'
import type { GGameData, GPalette, GTile } from '../types'

/** One line of the log on paper. */
export type PrintTurn = {
  n: number
  kind: 'claim' | 'hint'
  tiles: GTile[]
  who: string
}

/**
 * What a setgame printout contains.
 *
 * **It is a LOG, not a print-and-play.** Several games print something you can
 * pick up and use — a crossword to fill in, a board to play from. There is
 * nothing like that here: a setgame board is a shuffle that changes every few
 * seconds, so a printed one would be a photograph of a moment nobody can return
 * to. What survives the game is what HAPPENED, and that is what prints.
 *
 * Every player's rows in one sequence, in both modes — the same combined view
 * the info column's log defaults to. A printout is the table's record, and
 * splitting it per player would cost paper the one thing it is good at: reading
 * the game back in order.
 *
 * The per-player totals print in BOTH modes, unlike the screen, which holds
 * coop's breakdown back until the end. Nothing is live here — you print a
 * game to look at it afterwards — so the reason for holding it back (not
 * turning a cooperative game into a running scoreboard) doesn't apply.
 */
export type SetgamePrintModel = PrintHeader & {
  // Per-player totals, most sets first.
  scores: { name: string; sets: number; hints: number }[]
  // The log, oldest first.
  turns: PrintTurn[]
  // Which pigments to draw the tiles in — the game's own setup choice.
  palette: GPalette
}

export function buildPrintModel({
  gd,
  date,
  palette,
}: {
  gd: GGameData
  date: string
  palette: GPalette
}): SetgamePrintModel {
  const nSetsFound = gd.me.nSetsFound
  const sets = `${nSetsFound} ${nSetsFound === 1 ? 'set' : 'sets'}`
  // The summary reads as a state line, matching what the info column says: how
  // much game is left during play, what the table got at the end. It does not
  // count the tiles left over — that is the ordinary ending, not a shortfall
  // (lib/gameEndingMessage.ts).
  const summary = gd.ended ? `${sets} found` : `${sets} found · ${gd.me.nTilesInDeck} in the deck`

  return {
    brand: gd.brand,
    gameTitle: gd.title,
    date,
    summary,
    setupRows: gd.setupRows,
    mode: gd.mode,
    palette,
    scores: gd.players
      .map((p) => ({ name: p.username, sets: p.own.nSetsFound, hints: p.own.nHintsUsed }))
      .sort((a, b) => b.sets - a.sets),
    turns: gd.events.map((event, i) => ({
      n: i + 1,
      kind: event.kind,
      tiles: event.tiles,
      who: event.by.username,
    })),
  }
}
