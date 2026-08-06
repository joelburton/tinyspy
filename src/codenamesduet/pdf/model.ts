import type { PrintHeader , SetupRow } from '../../common/pdf/frame'
import type { TurnRow } from '../../common/pdf/turnLog'
import type { KeyLabel } from '../lib/labels'
import type { Seat } from '../lib/phase'
import type { ClueRow } from '../hooks/useClues'
import type { GuessRow, WordRow } from '../hooks/useBoard'

/**
 * Build the codenamesduet print model — the pure half, away from jsPDF so the
 * judgment is testable without a renderer.
 *
 * codenamesduet stacks THREE independent facts on one tile, and paper has to
 * keep them apart without leaning on colour (a mono printer flattens the whole
 * palette to one grey):
 *
 *   1. **what happened** — the word was contacted as an agent, hit the
 *      assassin, or someone burned it as a bystander. Global, public.
 *   2. **my key** — what the word is on MY card. The thing I give clues from.
 *   3. **the peer's key** — secret until the game ends, then the other half of
 *      the story.
 *
 * Each becomes a `Mark` ('agent' | 'neutral' | 'assassin'), which the renderer
 * draws as ✓ / – / ✗ plus a colour. Shape carries it; colour is the bonus.
 *
 * The bystander TRIANGLES survive too (who burned a word — me or my partner),
 * because a partner-burned word is still mine to guess while one I burned is
 * locked to me. That asymmetry is exactly what you want when planning a clue on
 * paper, so it isn't decoration.
 */

/** What a mark means. Renders as ✓ / – / ✗. */
export type Mark = 'agent' | 'neutral' | 'assassin'

/** One printed board cell. */
export type PrintCell = {
  word: string
  /** What HAPPENED here — null while the word is untouched. */
  outcome: Mark | null
  /** My key's label. Always present: the print exists to be thought about. */
  mine: Mark
  /** The partner's label — terminal only, null during play. */
  peer: Mark | null
  /** I burned this as a bystander (locked to me, still open to my partner). */
  burnedByMe: boolean
  /** My partner burned it (still open to ME — the Duet asymmetry). */
  burnedByPeer: boolean
}

export type DuetPrintModel = PrintHeader & {
  /** 25 cells in board order (row-major, 5×5). */
  cells: PrintCell[]
  /** True once both keys print — drives the legend and the second inset. */
  showsBothKeys: boolean
  turns: TurnRow[]
}

const MARK_OF: Record<KeyLabel, Mark> = { G: 'agent', N: 'neutral', A: 'assassin' }

/** The global reveal: 'G' contacted an agent, 'A' hit the assassin. A bystander
 *  is NOT global (it's per-seat), so it's derived from the two burn flags. */
function outcomeOf(w: WordRow): Mark | null {
  if (w.revealed_as === 'G') return 'agent'
  if (w.revealed_as === 'A') return 'assassin'
  return w.neutral_a || w.neutral_b ? 'neutral' : null
}

export function buildDuetPrintModel(o: {
  brand: string
  gameTitle: string
  date: string
  words: WordRow[]
  /** The caller's key — 25 labels, indexed by board position. */
  myKey: KeyLabel[]
  /** The partner's key. The FE only holds this once the game is over AND it's
   *  been revealed (a clean win, or the Reveal control) — so a print of a lost,
   *  unrevealed game carries no peer column. */
  peerKey: KeyLabel[] | null
  mySeat: Seat | undefined
  isTerminal: boolean
  clues: ClueRow[]
  guesses: GuessRow[]
  /** Seat → the human's name, for the log's Player column. */
  nameForSeat: (seat: Seat) => string
  greenFound: number
  totalAgents: number
  turnNumber: number
  turnCap: number
  setup: SetupRow[]
  mode: 'coop' | 'compete'
}): DuetPrintModel {
  // The peer's key is a SECRET while the game is live, and post-game it's held
  // back until someone presses Reveal (useBoard's `revealPeer` is PlayArea's
  // win-or-asked `peerKeyShown`) — so `o.peerKey` is already null in both cases
  // and a printout can't spoil the post-mortem either. This terminal check is
  // the second lock: a printer that asked for the key regardless would be one
  // refactor away from putting the answer on paper mid-game.
  const peerKey = o.isTerminal ? o.peerKey : null

  const cells: PrintCell[] = [...o.words]
    .sort((a, b) => a.position - b.position)
    .map((w) => ({
      word: w.word,
      outcome: outcomeOf(w),
      mine: MARK_OF[o.myKey[w.position]],
      peer: peerKey ? MARK_OF[peerKey[w.position]] : null,
      // Which seat burned it decides who it's still open to, so the two flags
      // aren't interchangeable — see the triangles note above.
      burnedByMe: o.mySeat === 'A' ? w.neutral_a : o.mySeat === 'B' ? w.neutral_b : false,
      burnedByPeer: o.mySeat === 'A' ? w.neutral_b : o.mySeat === 'B' ? w.neutral_a : false,
    }))

  // One row per TURN: the clue, then the words it actually produced. That's how
  // the game reads — a clue is only meaningful through what it got.
  const byTurn = new Map<number, GuessRow[]>()
  for (const g of o.guesses) {
    const rows = byTurn.get(g.turn_number) ?? []
    rows.push(g)
    byTurn.set(g.turn_number, rows)
  }
  const turns: TurnRow[] = [...o.clues]
    .sort((a, b) => a.turn_number - b.turn_number)
    .map((c) => {
      const got = (byTurn.get(c.turn_number) ?? [])
        .sort((a, b) => a.guessed_at.localeCompare(b.guessed_at))
        .map((g) => g.word.toUpperCase())
      return {
        seq: c.turn_number,
        who: o.nameForSeat(c.by_seat as Seat),
        // The clue leads; it's the part that can't be reconstructed from the
        // board, and drawTurnLog truncates the tail.
        //
        // The separator is '»' (U+00BB), not '→' (U+2192): jsPDF's core fonts
        // are WinAnsi, which HAS the guillemet but not the arrow — U+2192 came
        // out as mojibake (`!'`). It's the closest real character to an arrow
        // the encoding offers, and beats a hand-made '->'. Check the same way
        // before putting any new symbol in printed text; that's also why
        // marks.ts DRAWS its check and cross rather than typing them.
        text: `${c.word.toUpperCase()} ${c.count}${got.length ? ` » ${got.join(', ')}` : ''}`,
      }
    })

  return {
    brand: o.brand,
    gameTitle: o.gameTitle,
    date: o.date,
    summary:
      `${o.greenFound}/${o.totalAgents} agents contacted · ` +
      `turn ${o.turnNumber}/${o.turnCap}`,
    setup: o.setup,
    mode: o.mode,
    cells,
    showsBothKeys: peerKey !== null,
    turns,
  }
}
