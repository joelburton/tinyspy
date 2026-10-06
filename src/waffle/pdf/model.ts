// cs-fixed-outcome-fix

import type { PrintHeader , SetupRow } from '@/common/pdf/frame'
import type { TurnRow } from '@/common/pdf/eventLog'
import { getTileColor, type TileColor } from '@/shared/wordle-style/tileColor'
import { boardWords, CELLS, coord } from '../lib/waffle'
import type { GEvent, GLetterTile, GPlayer, GTile } from '../types'

/**
 * Build the waffle print model — the pure half, away from jsPDF.
 *
 * The judgment here is the same shape as wordle's, for the same reason: a
 * compete track must carry **one player's** board and **that player's** swaps,
 * and mid-game the viewer holds nobody's but their own. Getting it wrong would
 * print a board beside a log that doesn't belong to it, which is worse than
 * printing nothing.
 */

/** One board cell. Holes carry no letter and no state. */
export type PrintCell = { letter: string; state: TileColor; hole: boolean }

/** One player's page-column: their board and their swaps. */
export type PrintTrack = {
  who: string
  // 25 cells, row-major (holes included, so the 5×5 shape is preserved).
  cells: PrintCell[]
  turns: TurnRow[]
  // Their outcome line ("Solved in 7 swaps" / "12/12 swaps used").
  result: string
}

export type WafflePrintModel = PrintHeader & {
  tracks: PrintTrack[]
  // The six answer words once they are on screen — null until then.
  solutionWords: string[] | null
}

/** A board's tiles → its 25 printable cells, row-major, holes included. */
function cellsOf(tiles: readonly GTile[]): PrintCell[] {
  const tileById = new Map(tiles.map((t) => [t.id, t]))
  return Array.from({ length: CELLS }, (_, pos) => {
    const tile = tileById.get(String(pos))
    // A hole isn't an un-guessed tile, it's not part of the puzzle — so it gets
    // the blank (borderless) state and prints as empty space.
    if (tile === undefined) return { letter: '', state: 'blank' as TileColor, hole: true }
    // Paper takes its capitals by hand: there is no CSS to draw them.
    return { letter: tile.letter.toUpperCase(), state: getTileColor(tile.color), hole: false }
  })
}

/**
 * The print model for the board as the viewer may see it: each track one
 * board and its own swaps, the solution only once it is legitimately on screen.
 */
export function buildWafflePrintModel(o: {
  brand: string
  gameTitle: string
  date: string
  mode: 'coop' | 'compete'
  isGameEnded: boolean
  maxSwaps: number
  parSwaps: number
  // Each player as `gd` holds them, with their side's count — the team's in
  // coop: a compete rival's board is null mid-race (`useGame`'s seat rule),
  // which is why they get no track then.
  players: Pick<GPlayer, 'id' | 'username' | 'board' | 'nSwapsUsed' | 'solved'>[]
  // Every swap the viewer can see (`gd.events`). Compete mid-game: only their
  // own.
  events: GEvent[]
  myId: string
  // The solved board — null until the game ends.
  solution: GLetterTile[] | null
  // Is the answer legitimately on screen? Solved or explicitly revealed — NOT
  // merely ended. waffle hides the solution on a loss for the same reason
  // wordle does, and paper has to hold the same line.
  answerShown: boolean
  setupRows: SetupRow[]
}): WafflePrintModel {
  const swapText = (e: GEvent) =>
    e.swaps.map((s) => `${s.letter.toUpperCase()} (${coord(Number(s.id))})`).join(' <-> ')

  const track = (
    who: string,
    p: (typeof o.players)[number],
    events: GEvent[],
    logNames: boolean,
  ): PrintTrack => ({
    who,
    cells: p.board ? cellsOf(p.board.tiles) : [],
    turns: events.map((e, i) => ({
      seq: i + 1,
      // Coop's one board is worked by everyone, so its log names who moved.
      // A compete track is one person's, so repeating their name every row
      // would be noise — the column heading already says whose it is.
      who: logNames ? e.by.username : '',
      text: swapText(e),
    })),
    result: p.solved
      ? `Solved in ${p.nSwapsUsed} swap${p.nSwapsUsed === 1 ? '' : 's'}`
      : `${p.nSwapsUsed}/${o.maxSwaps} swaps used`,
  })

  // Coop is ONE shared board, so one track whose log names each swapper, and
  // whose count is the team's. Compete is one track per player — once the game
  // has ended, when boards and logs both open. Mid-game the viewer has only
  // their own of either.
  const me = o.players.find((p) => p.id === o.myId)!
  let tracks: PrintTrack[]
  if (o.mode === 'coop') {
    tracks = [track('Team', me, o.events, true)]
  } else if (o.isGameEnded) {
    tracks = o.players.flatMap((p) => {
      if (p.board === null) return []
      const who = p.id === o.myId ? `${p.username} (you)` : p.username
      return [track(who, p, o.events.filter((e) => e.by.id === p.id), false)]
    })
  } else {
    tracks = [track('You', me, o.events.filter((e) => e.by.id === o.myId), false)]
  }

  return {
    brand: o.brand,
    gameTitle: o.gameTitle,
    date: o.date,
    summary:
      o.mode === 'coop'
        ? `Co-op · par ${o.parSwaps} · ${o.maxSwaps} swaps allowed`
        : `Compete · par ${o.parSwaps} · ${o.maxSwaps} swaps allowed`,
    setupRows: o.setupRows,
    mode: o.mode,
    tracks,
    // The solution is the answer, printed under the same rule the screen uses:
    // solved or revealed. The game having ended is NOT enough.
    solutionWords: o.answerShown && o.solution ? boardWords(o.solution) : null,
  }
}
