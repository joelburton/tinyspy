import type { PrintHeader , SetupRow } from '../../common/pdf/frame'
import type { TurnRow } from '../../common/pdf/turnLog'
import { offBoardIds, type Tile } from '../lib/board'
import type { SubmissionRow } from '../hooks/useGame'

/**
 * Build the stackdown print model — the pure half, away from jsPDF so the
 * judgment is testable without a renderer (the split wordiply and connections
 * use).
 *
 * The judgment worth testing here is the **hidden solution**. stackdown's six
 * words are gated server-side (`games_state` returns `solution` as null until
 * the row is terminal), so paper can't leak them even by accident — but the
 * model still has to not *ask* for them mid-game and not draw an empty reveal
 * block. The log's own vocabulary carries the second half of it: a `reveal`
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
  /** Column heading — "Team", or a player's name. */
  who: string
  /** The tiles still on THIS board. Empty once it's cleared. */
  tiles: Tile[]
  /** Words cleared on this board, as a line under it. */
  result: string
  turns: PrintTurn[]
}

export type StackdownPrintModel = PrintHeader & {
  tracks: PrintTrack[]
  /** The six words, in clearing order. Terminal only; null during play. */
  solution: string[] | null
}

/**
 * One submission as a printed line.
 *
 * The three kinds have to stay distinguishable in **black and white**, where the
 * on-screen outcome bar's green/red is one grey. So the text carries it: a valid
 * word stands alone, an invalid one is tagged, and a cheat request is named. No
 * drawn marks needed — same reasoning as wordiply's log.
 */
function turnText(s: SubmissionRow): string {
  if (s.kind === 'hint') return `Hint: ${s.word ?? '—'}`
  if (s.kind === 'reveal') return `Spoiler: ${(s.word ?? '').toUpperCase()}`
  const word = (s.word ?? '').toUpperCase()
  return s.valid ? word : `${word} — not a word`
}

export function buildStackdownPrintModel(o: {
  brand: string
  gameTitle: string
  date: string
  /** The WHOLE stack — every tile the board started with. Which of them are
   *  still down is worked out per track, since compete's players each cleared a
   *  different set. */
  allTiles: Tile[]
  /** The viewer's picked-up-but-not-yet-submitted tiles. Theirs alone; nobody
   *  else's in-progress word is visible, and it doesn't survive terminal. */
  currentWord: number[]
  /** From `games_state`: the six words, or null while the game is live. */
  solution: string[] | null
  submissions: SubmissionRow[]
  players: { user_id: string; username: string }[]
  selfId: string
  mode: 'coop' | 'compete'
  isTerminal: boolean
  /** Words cleared so far, and the target (six). */
  found: number
  target: number
  setup: SetupRow[]
}): StackdownPrintModel {
  const nameOf = (userId: string) =>
    o.players.find((p) => p.user_id === userId)?.username ?? 'someone'

  /** One column: whose it is, which submissions built it, and whether the log
   *  needs to name the player (coop's shared board does; a compete column
   *  doesn't — its heading already says whose it is). */
  const track = (who: string, rows: SubmissionRow[], logNames: boolean): PrintTrack => {
    const removed = new Set<number>()
    for (const s of rows) {
      if (s.kind === 'word' && s.valid && s.tile_ids) for (const id of s.tile_ids) removed.add(id)
    }
    const cleared = rows.filter((s) => s.kind === 'word' && s.valid).length
    // The SAME rule the screen uses, applied per board: a cleared stack comes
    // back for review, an uncleared one stays where it stopped.
    const off = offBoardIds(o.allTiles, removed, logNames ? o.currentWord : [], o.isTerminal)
    return {
      who,
      tiles: o.allTiles.filter((t) => !off.has(t.id)),
      result: `${cleared}/${o.target} words cleared`,
      turns: rows.map((s, i) => ({
        seq: i + 1,
        who: logNames ? nameOf(s.user_id) : '',
        text: turnText(s),
      })),
    }
  }

  // Coop is ONE shared stack, so one track whose log names each player. Compete
  // gives each player their own — but only at TERMINAL, when RLS opens
  // everybody's submissions. Mid-game the viewer holds nobody else's, and a
  // column built from no rows would show a full untouched stack, which reads as
  // "they've cleared nothing" rather than "you can't see this yet".
  let tracks: PrintTrack[]
  if (o.mode === 'coop') {
    tracks = [track('Team', o.submissions, true)]
  } else if (o.isTerminal) {
    tracks = o.players.map((pl) =>
      track(
        pl.user_id === o.selfId ? `${pl.username} (you)` : pl.username,
        o.submissions.filter((s) => s.user_id === pl.user_id),
        false,
      ),
    )
  } else {
    tracks = [track('You', o.submissions.filter((s) => s.user_id === o.selfId), false)]
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
        ? `${o.found}/${o.target} words cleared · ${shown} tile${shown === 1 ? '' : 's'} left`
        : `${o.found}/${o.target} words cleared`,
    setup: o.setup,
    mode: o.mode,
    tracks,
    // Never reach for the solution before terminal. The server already withholds
    // it (games_state gates on is_terminal), so this is belt-and-braces — but a
    // printer that ASKED for it would be one schema change away from leaking it.
    solution: o.isTerminal ? o.solution : null,
  }
}
