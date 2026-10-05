// cs-fixed-outcome-fix

import type { PrintHeader , SetupRow } from '@/common/pdf/frame'
import type { TurnRow } from '@/common/pdf/eventLog'
import { offBoardIds } from '../lib/board'
import type { GBoard, GEvent, GPlayer, GTile } from '../types'

/**
 * Build the stackdown print model — the pure half, away from jsPDF so the
 * judgment is testable without a renderer (the split wordiply and connections
 * use).
 *
 * The judgment worth testing here is the **hidden solution**. stackdown's six
 * words stay out of the page blob until the game has ended, so paper can't leak
 * them even by accident — but the model still has to not *ask* for them
 * mid-game and not draw an empty reveal block. The log's own vocabulary carries the second half of it: a `reveal`
 * request is a logged cheat, and it prints as one.
 */

/** One printed submission row. */
export type PrintTurn = TurnRow

/**
 * One printed column: a board and the log that belongs to it.
 *
 * Coop is a single track — one shared stack, one shared sequence of words, and
 * its log names who played each. Compete gives every player their OWN stack, so
 * it gets a track each and the logs don't name anybody (the heading already
 * does).
 */
export type PrintTrack = {
  // Column heading — "Team", or a player's name.
  who: string
  // The tiles still on THIS board. Empty once it's cleared.
  tiles: GTile[]
  // Words cleared on this board, as a line under it.
  result: string
  turns: PrintTurn[]
}

export type StackdownPrintModel = PrintHeader & {
  tracks: PrintTrack[]
  // The six words, in clearing order. Once ended only; null during play.
  solution: string[] | null
}

/**
 * One turn as a printed line.
 *
 * The three kinds have to stay distinguishable in **black and white**, where the
 * on-screen outcome bar's green/red is one gray. So the text carries it: a valid
 * word stands alone, an invalid one is tagged, and a cheat request is named. No
 * drawn marks needed — same reasoning as wordiply's log.
 */
function makeTurnText(e: GEvent): string {
  if (e.kind === 'hint') return `Hint: ${e.clue}`
  const word = e.word!.toUpperCase()
  if (e.kind === 'spoiler') return `Spoiler: ${word}`
  return e.valid ? word : `${word} — not a word`
}

export function buildStackdownPrintModel(o: {
  brand: string
  gameTitle: string
  date: string
  mode: 'coop' | 'compete'
  ended: boolean
  // The WHOLE stack — every tile the board started with.
  tiles: GTile[]
  // Every player, each with the stack their seat sees — null for a rival
  // mid-race, whose board is withheld.
  players: GPlayer[]
  me: GPlayer & { board: GBoard }
  // The turns I may see: everyone's in coop, mine alone mid-race.
  events: GEvent[]
  // The six words, in clearing order, while they are on screen; else null.
  solution: string[] | null
  // Words cleared — the team's in coop, mine in compete — and the six to clear.
  nFoundWords: number
  nReqdWords: number
  setupRows: SetupRow[]
}): StackdownPrintModel {
  /** One column: whose it is, the stack their seat sees, the turns that built
   *  it, and whether the log names the player (coop's shared board does; a
   *  compete column doesn't — its heading already says whose it is). */
  const makeTrack = (who: string, board: GBoard, events: GEvent[], logNames: boolean): PrintTrack => {
    const onBoard = new Set(board.tiles.map((t) => t.id))
    const cleared = o.tiles.filter((t) => !onBoard.has(t.id)).map((t) => t.id)
    // The SAME rule the screen uses, applied per board: a cleared stack comes
    // back for review, an uncleared one stays where it stopped.
    const off = offBoardIds(o.tiles, cleared, o.ended)
    return {
      who,
      tiles: o.tiles.filter((t) => !off.has(t.id)),
      result: `${events.filter((e) => e.kind === 'word' && e.valid).length}/${o.nReqdWords} words cleared`,
      turns: events.map((e, i) => ({
        seq: i + 1,
        who: logNames ? e.by.username : '',
        text: makeTurnText(e),
      })),
    }
  }

  // Coop is ONE shared stack, so one track whose log names each player. Compete
  // gives each player their own — but only once the game has ended, when every
  // racer's board and rows open. Mid-race I hold nobody else's, so mine is the
  // only column.
  let tracks: PrintTrack[]
  if (o.mode === 'coop') {
    tracks = [makeTrack('Team', o.me.board, o.events, true)]
  } else if (o.ended) {
    tracks = o.players.map((p) =>
      makeTrack(
        p === o.me ? `${p.username} (you)` : p.username,
        // Every board is open once the game has ended.
        p.board!,
        o.events.filter((e) => e.by === p),
        false,
      ),
    )
  } else {
    tracks = [makeTrack('You', o.me.board, o.events.filter((e) => e.by === o.me), false)]
  }

  const shown = tracks[0]?.tiles.length ?? 0
  return {
    brand: o.brand,
    gameTitle: o.gameTitle,
    date: o.date,
    // The on-screen readout. Compete's tile count would be ambiguous across
    // several boards, so only the shared coop stack reports one.
    summary:
      o.mode === 'coop'
        ? `${o.nFoundWords}/${o.nReqdWords} words cleared · ${shown} tile${shown === 1 ? '' : 's'} left`
        : `${o.nFoundWords}/${o.nReqdWords} words cleared`,
    setupRows: o.setupRows,
    mode: o.mode,
    tracks,
    // Never reach for the solution before the end. The blob already withholds
    // it, so this is belt-and-braces — but a printer that ASKED for it would be
    // one change away from leaking it.
    solution: o.ended ? o.solution : null,
  }
}
