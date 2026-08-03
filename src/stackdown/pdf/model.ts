import type { PrintHeader } from '../../common/pdf/frame'
import type { TurnRow } from '../../common/pdf/turnLog'
import type { Tile } from '../lib/board'
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

export type StackdownPrintModel = PrintHeader & {
  /** The tiles STILL on the stack, at click time — the snapshot the player is
   *  looking at. Empty once the board is cleared. */
  tiles: Tile[]
  /** The six words, in clearing order. Terminal only; null during play. */
  solution: string[] | null
  turns: PrintTurn[]
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
  /** Tiles remaining on the stack (removed ones already filtered out). */
  tiles: Tile[]
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
  setup: { label: string; value: string }[]
}): StackdownPrintModel {
  const nameOf = (userId: string) =>
    o.players.find((p) => p.user_id === userId)?.username ?? 'someone'

  // Compete players work the same stack independently, so group each run rather
  // than interleaving by time. Mid-game it's a no-op — RLS gives the viewer only
  // their own rows. Coop is one shared sequence and keeps its order.
  const ordered =
    o.mode === 'compete'
      ? [...o.submissions].sort((a, b) => {
          if (a.user_id !== b.user_id) {
            if (a.user_id === o.selfId) return -1
            if (b.user_id === o.selfId) return 1
            return nameOf(a.user_id).localeCompare(nameOf(b.user_id))
          }
          return a.seq - b.seq
        })
      : o.submissions

  return {
    brand: o.brand,
    gameTitle: o.gameTitle,
    date: o.date,
    // The on-screen readout: words cleared, and how much stack is left.
    summary:
      `${o.found}/${o.target} words cleared · ` +
      `${o.tiles.length} tile${o.tiles.length === 1 ? '' : 's'} left`,
    setup: o.setup,
    tiles: o.tiles,
    // Never reach for the solution before terminal. The server already withholds
    // it (games_state gates on is_terminal), so this is belt-and-braces — but a
    // printer that ASKED for it would be one schema change away from leaking it.
    solution: o.isTerminal ? o.solution : null,
    turns: ordered.map((s, i) => ({
      seq: i + 1,
      who: nameOf(s.user_id),
      text: turnText(s),
    })),
  }
}
