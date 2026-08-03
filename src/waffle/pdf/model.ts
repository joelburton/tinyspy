import type { PrintHeader } from '../../common/pdf/frame'
import type { TurnRow } from '../../common/pdf/turnLog'
import { tileColor, type TileColor } from '../../common/lib/color/tileColor'
import { coord, isHole } from '../lib/waffle'
import type { SwapRow } from '../hooks/useGame'

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
    state: isHole(i) ? ('blank' as TileColor) : tileColor(colors?.[i]),
    hole: isHole(i),
  }))
}

export function buildWafflePrintModel(o: {
  brand: string
  gameTitle: string
  date: string
  mode: 'coop' | 'compete'
  isTerminal: boolean
  maxSwaps: number
  parSwaps: number
  /** Per-player board + colors + progress. A compete opponent's board is null
   *  mid-game (the server withholds it), which is why they get no track. */
  playerBoards: {
    user_id: string
    board: string | null
    colors: string | null
    swaps_used: number
    solved: boolean
  }[]
  /** Every swap the viewer can see. Compete mid-game: only their own. */
  swaps: SwapRow[]
  players: { user_id: string; username: string }[]
  selfId: string
  /** The six words, from the gated view — null until the server releases them. */
  solutionWords: string[] | null
  /**
   * Is the answer legitimately on screen? Solved or explicitly revealed — NOT
   * merely terminal. waffle hides the solution on a loss for the same reason
   * wordle does, and paper has to hold the same line.
   */
  answerShown: boolean
  setup: { label: string; value: string }[]
}): WafflePrintModel {
  const nameOf = (id: string) => o.players.find((p) => p.user_id === id)?.username ?? 'someone'

  const swapText = (s: SwapRow) =>
    `${s.letter_a.toUpperCase()} (${coord(s.pos_a)}) <-> ${s.letter_b.toUpperCase()} (${coord(s.pos_b)})`

  const track = (
    who: string,
    p: { board: string | null; colors: string | null; swaps_used: number; solved: boolean },
    swaps: SwapRow[],
    logNames: boolean,
  ): PrintTrack => ({
    who,
    cells: p.board ? cellsOf(p.board, p.colors) : [],
    turns: swaps.map((s, i) => ({
      seq: i + 1,
      // Coop's one board is worked by everyone, so its log names who moved.
      // A compete track is one person's, so repeating their name every row
      // would be noise — the column heading already says whose it is.
      who: logNames ? nameOf(s.user_id) : '',
      text: swapText(s),
    })),
    result: p.solved
      ? `Solved in ${p.swaps_used} swap${p.swaps_used === 1 ? '' : 's'}`
      : `${p.swaps_used}/${o.maxSwaps} swaps used`,
  })

  // Coop is ONE shared board, so one track whose log names each swapper.
  // Compete is one track per player — at terminal, when boards and logs both
  // open. Mid-game the viewer has only their own of either.
  let tracks: PrintTrack[]
  const byUser = new Map(o.playerBoards.map((p) => [p.user_id, p]))
  if (o.mode === 'coop') {
    const p = o.playerBoards[0]
    tracks = p ? [track('Team', p, o.swaps, true)] : []
  } else if (o.isTerminal) {
    tracks = o.players.flatMap((pl) => {
      const p = byUser.get(pl.user_id)
      if (!p) return []
      const who = pl.user_id === o.selfId ? `${pl.username} (you)` : pl.username
      return [track(who, p, o.swaps.filter((s) => s.user_id === pl.user_id), false)]
    })
  } else {
    const p = byUser.get(o.selfId)
    tracks = p ? [track('You', p, o.swaps.filter((s) => s.user_id === o.selfId), false)] : []
  }

  return {
    brand: o.brand,
    gameTitle: o.gameTitle,
    date: o.date,
    summary:
      o.mode === 'coop'
        ? `Co-op · par ${o.parSwaps} · ${o.maxSwaps} swaps allowed`
        : `Compete · par ${o.parSwaps} · ${o.maxSwaps} swaps allowed`,
    setup: o.setup,
    tracks,
    // The solution is the answer, printed under the same rule the screen uses:
    // solved or revealed. Terminal alone is NOT enough.
    solutionWords: o.answerShown ? o.solutionWords : null,
  }
}
