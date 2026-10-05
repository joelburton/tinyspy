// cs-fixed-outcome-fix

import type { PrintHeader , SetupRow } from '@/common/pdf/frame'
import type { TurnRow } from '@/common/pdf/eventLog'
import { getTileColor, type TileColor } from '@/shared/wordle-style/tileColor'
import { boardWords, coord, isHole, makeBoardString, makeColorString } from '../lib/waffle'
import type { GEvent, GLetterTile, GPlayer, GTeam } from '../types'

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
  /** 25 cells, row-major (holes included, so the 5×5 shape is preserved). */
  cells: PrintCell[]
  turns: TurnRow[]
  /** Their outcome line ("Solved in 7 swaps" / "12/12 swaps used"). */
  result: string
}

export type WafflePrintModel = PrintHeader & {
  tracks: PrintTrack[]
  /** The six answer words — terminal only, null while the game is live. */
  solutionWords: string[] | null
}

/** A board + colors string pair → printable cells. */
function cellsOf(board: string, colors: string | null): PrintCell[] {
  return [...board].map((ch, i) => ({
    letter: isHole(i) ? '' : ch.toUpperCase(),
    // A hole isn't an un-guessed tile, it's not part of the puzzle — so it gets
    // the blank (borderless) state and prints as empty space.
    state: isHole(i) || colors === null ? ('blank' as TileColor) : getTileColor(colors[i]),
    hole: isHole(i),
  }))
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
  // Each player as `gd` holds them: a compete rival's board is null mid-race
  // (`useGame`'s seat rule), which is why they get no track then.
  players: Pick<GPlayer, 'id' | 'username' | 'board' | 'nSwapsUsed' | 'solved'>[]
  // Coop's shared count; null in compete.
  team: GTeam | null
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
    nSwapsUsed: number,
    events: GEvent[],
    logNames: boolean,
  ): PrintTrack => ({
    who,
    cells: p.board ? cellsOf(makeBoardString(p.board.tiles), makeColorString(p.board.tiles)) : [],
    turns: events.map((e, i) => ({
      seq: i + 1,
      // Coop's one board is worked by everyone, so its log names who moved.
      // A compete track is one person's, so repeating their name every row
      // would be noise — the column heading already says whose it is.
      who: logNames ? e.by.username : '',
      text: swapText(e),
    })),
    result: p.solved
      ? `Solved in ${nSwapsUsed} swap${nSwapsUsed === 1 ? '' : 's'}`
      : `${nSwapsUsed}/${o.maxSwaps} swaps used`,
  })

  // Coop is ONE shared board, so one track whose log names each swapper, and
  // whose count is the team's. Compete is one track per player — once the game
  // has ended, when boards and logs both open. Mid-game the viewer has only
  // their own of either.
  const me = o.players.find((p) => p.id === o.myId)!
  let tracks: PrintTrack[]
  if (o.mode === 'coop') {
    tracks = [track('Team', me, o.team!.nSwapsUsed, o.events, true)]
  } else if (o.isGameEnded) {
    tracks = o.players.flatMap((p) => {
      if (p.board === null) return []
      const who = p.id === o.myId ? `${p.username} (you)` : p.username
      return [track(who, p, p.nSwapsUsed, o.events.filter((e) => e.by.id === p.id), false)]
    })
  } else {
    tracks = [track('You', me, me.nSwapsUsed, o.events.filter((e) => e.by.id === o.myId), false)]
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
    // solved or revealed. Terminal alone is NOT enough.
    solutionWords: o.answerShown && o.solution ? boardWords(makeBoardString(o.solution)) : null,
  }
}
