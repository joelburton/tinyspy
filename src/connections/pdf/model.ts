import type { PrintHeader , SetupRow } from '../../common/pdf/frame'
import type { TurnRow } from '../../common/pdf/turnLog'
import type { Category, CategoryRank } from '../lib/board'
import type { GuessRow, MatchedCategory } from '../hooks/useGame'

/**
 * Build the connections print model — the pure half, kept away from jsPDF so the
 * judgment is testable without a renderer (same split as wordiply's).
 *
 * The judgment here is mostly about **what a category band has to carry on
 * paper**. On screen a band is identified by its fill colour — NYT's
 * yellow/green/blue/purple for rank 0–3. Print can't lean on that twice over:
 * a full-bleed fill is far too much ink, and a mono printer flattens all four
 * to the same grey. So a printed band is a thick coloured BORDER plus a
 * **letter A–D**, and the letter is the load-bearing one — it's the only signal
 * that survives a black-and-white printer.
 *
 * A–D is a faithful stand-in rather than an arbitrary label: rank 0–3 IS the
 * difficulty order (yellow easiest → purple hardest), which is exactly what the
 * colour encodes. So "we got A and C" says the same thing on paper as the two
 * coloured bands say on screen.
 */

/** rank → the printed letter. Rank 0..3 is NYT's difficulty order. */
export const RANK_LETTER: Record<CategoryRank, string> = { 0: 'A', 1: 'B', 2: 'C', 3: 'D' }

/** One solved (or end-of-game revealed) category, as printed. */
export type PrintBand = {
  rank: CategoryRank
  /** A–D. The B&W-safe stand-in for the band colour. */
  letter: string
  name: string
  tiles: string[]
}

export type ConnectionsPrintModel = PrintHeader & {
  /** Bands to draw, in rank order. */
  bands: PrintBand[]
  /** Tiles not yet in a band, in board order — `[]` once all four are shown. */
  remainingTiles: string[]
  /** The turn log. Compete at terminal carries every player's. */
  turns: TurnRow[]
}

/**
 * The verdict, kept SHORT on purpose.
 *
 * `drawTurnLog`'s move column holds ~38 characters at 9pt, and four tiles eat
 * ~30 of them, so every character of prefix costs a character of the guess.
 * Measured against the real renderer: `one away — …` truncated the last tile;
 * `1 away: …` doesn't. A correct guess shows the category's LETTER, which ties
 * the row straight back to the band it solved — the same A–D vocabulary doing
 * double duty, and the shortest possible prefix.
 *
 * A category of genuinely long words can still ellipsize its final tile. That's
 * the accepted cost of riding the shared one-line newspaper flow (the on-screen
 * log spends two rows per turn for exactly this reason). The VERDICT is what
 * can't be reconstructed from a truncated line, so it goes first and always
 * survives.
 */
function verdict(g: GuessRow): string {
  if (g.result === 'correct') {
    return g.matched_category_rank != null
      ? RANK_LETTER[g.matched_category_rank as CategoryRank]
      : 'match'
  }
  return g.result === 'oneAway' ? '1 away' : 'miss'
}

export function buildConnectionsPrintModel(o: {
  brand: string
  gameTitle: string
  date: string
  /** All four categories (public in both modes). */
  categories: Category[]
  /** The viewer's solved categories. */
  matched: MatchedCategory[]
  /** Revealed at game-end; `[]` during play. */
  unmatched: Category[]
  /** Tiles still on the board, in display order. */
  remainingTiles: string[]
  guesses: GuessRow[]
  players: { user_id: string; username: string }[]
  selfId: string
  mode: 'coop' | 'compete'
  isTerminal: boolean
  mistakes: number
  maxMistakes: number
  setup: SetupRow[]
}): ConnectionsPrintModel {
  const nameOf = (userId: string) =>
    o.players.find((p) => p.user_id === userId)?.username ?? 'someone'

  // Solved and end-of-game-revealed bands print IDENTICALLY — a category you
  // worked out and one the game handed you look the same, matching the screen
  // (the revealed-band darkening was dropped 2026-08-02 as imperceptible).
  const bands: PrintBand[] = [...o.matched, ...o.unmatched]
    .map((c) => ({
      rank: c.rank,
      letter: RANK_LETTER[c.rank],
      name: c.name,
      tiles: c.tiles,
    }))
    .sort((a, b) => a.rank - b.rank)

  // Compete tracks are independent races, so group each player's run rather
  // than interleaving by time. Mid-game this is a no-op: RLS means the viewer
  // only HAS their own rows. Coop is one shared sequence and stays in order.
  const ordered =
    o.mode === 'compete'
      ? [...o.guesses].sort((a, b) => {
          if (a.user_id !== b.user_id) {
            if (a.user_id === o.selfId) return -1
            if (b.user_id === o.selfId) return 1
            return nameOf(a.user_id).localeCompare(nameOf(b.user_id))
          }
          return a.guessed_at.localeCompare(b.guessed_at)
        })
      : o.guesses

  const turns: TurnRow[] = ordered.map((g, i) => ({
    seq: i + 1,
    who: nameOf(g.user_id),
    text: `${verdict(g)}: ${g.tiles.join(' · ')}`,
  }))

  const found = o.matched.length
  const total = o.categories.length

  return {
    brand: o.brand,
    gameTitle: o.gameTitle,
    date: o.date,
    // Exactly the on-screen readout: categories found + mistakes used.
    summary: `${found}/${total} categories found · ${o.mistakes}/${o.maxMistakes} mistakes`,
    setup: o.setup,
    mode: o.mode,
    bands,
    remainingTiles: o.remainingTiles,
    turns,
  }
}
