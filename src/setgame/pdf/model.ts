import type { Member } from '../../common/lib/games'
import type { PrintHeader, SetupRow } from '../../common/pdf/frame'
import type { Card } from '../lib/cards'
import type { Palette } from '../lib/setup'
import type { EventRow } from '../hooks/useGame'

/** One line of the log on paper. */
export type PrintTurn = {
  n: number
  kind: 'claim' | 'hint'
  cards: Card[]
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
 * coop's breakdown back until the terminal. Nothing is live here — you print a
 * game to look at it afterwards — so the reason for holding it back (not
 * turning a cooperative game into a running scoreboard) doesn't apply.
 */
export type SetgamePrintModel = PrintHeader & {
  /** Per-player totals, most sets first. */
  scores: { name: string; sets: number; hints: number }[]
  /** The log, oldest first. */
  turns: PrintTurn[]
  /** Which pigments to draw the cards in — the game's own setup choice. */
  palette: Palette
}

export function buildPrintModel({
  brand,
  gameTitle,
  date,
  mode,
  isTerminal,
  teamFound,
  deckLeft,
  players,
  foundByUser,
  hintsByUser,
  events,
  palette,
  setup,
}: {
  brand: string
  gameTitle: string
  date: string
  mode: 'coop' | 'compete'
  isTerminal: boolean
  teamFound: number
  deckLeft: number
  players: Member[]
  foundByUser: ReadonlyMap<string, number>
  hintsByUser: ReadonlyMap<string, number>
  events: EventRow[]
  palette: Palette
  setup: SetupRow[]
}): SetgamePrintModel {
  const sets = `${teamFound} ${teamFound === 1 ? 'set' : 'sets'}`
  // The summary reads as a state line, matching what the info column says: how
  // much game is left during play, what the table got at the end. It does not
  // count the cards left over — that is the ordinary ending, not a shortfall
  // (see buildOver in components/PlayArea).
  const summary = isTerminal ? `${sets} found` : `${sets} found · ${deckLeft} in the deck`

  const byName = new Map(players.map((p) => [p.user_id, p.username]))

  return {
    brand,
    gameTitle,
    date,
    summary,
    setup,
    mode,
    palette,
    scores: players
      .map((p) => ({
        name: p.username,
        sets: foundByUser.get(p.user_id) ?? 0,
        hints: hintsByUser.get(p.user_id) ?? 0,
      }))
      .sort((a, b) => b.sets - a.sets),
    turns: events.map((event, i) => ({
      n: i + 1,
      kind: event.kind,
      cards: event.cards,
      who: byName.get(event.user_id) ?? 'someone',
    })),
  }
}
