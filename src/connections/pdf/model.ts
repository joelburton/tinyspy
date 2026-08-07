import type { PrintHeader, SetupRow } from '../../common/pdf/frame'
import type { TurnRow } from '../../common/pdf/turnLog'
import type { Category, CategoryRank } from '../lib/board'
import type { GuessRow, MatchedCategory } from '../hooks/useGame'

/**
 * Build the connections print model — the pure half, kept away from jsPDF so the
 * judgment is testable without a renderer (same split as wordiply's).
 *
 * Two judgments live here.
 *
 * **What a category band has to carry on paper.** On screen a band is
 * identified by its fill colour — NYT's yellow/green/blue/purple for rank 0–3.
 * Print can't lean on that twice over: a full-bleed fill is far too much ink,
 * and a mono printer flattens all four to the same grey. So a printed band is a
 * thick coloured BORDER plus a **letter A–D**, and the letter is the
 * load-bearing one — it's the only signal that survives a black-and-white
 * printer. A–D is a faithful stand-in rather than an arbitrary label: rank 0–3
 * IS the difficulty order (yellow easiest → purple hardest), which is exactly
 * what the colour encodes.
 *
 * **Whose bands belong on whose board.** Compete players race their OWN copy
 * of the puzzle — own solved categories, own mistake budget, own log — so the
 * printout is one track per player (`common/pdf/columns.ts`), not one merged
 * board. The full solution prints once, on the VIEWER's track (their unsolved
 * categories reveal as bands at terminal, same as their screen); a rival's
 * track shows only what THEY earned, with their unsolved tiles as the plain
 * grid — that's their story, and it keeps the columns tellingly different.
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

/** One player's page-column: their bands, their leftover tiles, their log. */
export type PrintTrack = {
  who: string
  /** Bands to draw, in rank order. */
  bands: PrintBand[]
  /** Tiles not in any of THIS track's bands — `[]` once all four are shown. */
  remainingTiles: string[]
  turns: TurnRow[]
  /** Their own readout ("2/4 categories found · 3/4 mistakes"). */
  result: string
}

export type ConnectionsPrintModel = PrintHeader & {
  /** Coop is a single shared track; compete is one per player at terminal,
   *  or just yours during play (RLS hides rivals' guesses until then). */
  tracks: PrintTrack[]
}

/**
 * The verdict, kept SHORT on purpose.
 *
 * The coop page's `drawTurnLog` move column holds ~38 characters at 9pt, and
 * four tiles eat ~30 of them, so every character of prefix costs a character of
 * the guess. Measured against the real renderer: `one away — …` truncated the
 * last tile; `1 away: …` doesn't. A correct guess shows the category's LETTER,
 * which ties the row straight back to the band it solved — the same A–D
 * vocabulary doing double duty, and the shortest possible prefix.
 *
 * A category of genuinely long words can still ellipsize its final tile. That's
 * the accepted cost of a one-line row (the on-screen log spends two rows per
 * turn for exactly this reason). The VERDICT is what can't be reconstructed
 * from a truncated line, so it goes first and always survives.
 */
function verdict(g: GuessRow): string {
  if (g.result === 'correct') {
    return g.matched_category_rank != null
      ? RANK_LETTER[g.matched_category_rank as CategoryRank]
      : 'match'
  }
  return g.result === 'oneAway' ? '1 away' : 'miss'
}

function toBand(c: Category): PrintBand {
  return { rank: c.rank, letter: RANK_LETTER[c.rank], name: c.name, tiles: c.tiles }
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
  /** Tiles still on the viewer's board, in display order. */
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
  const total = o.categories.length

  const turnsOf = (guesses: GuessRow[], whoOf: (g: GuessRow) => string): TurnRow[] =>
    guesses.map((g, i) => ({ seq: i + 1, who: whoOf(g), text: `${verdict(g)}: ${g.tiles.join(' · ')}` }))

  const resultOf = (found: number, mistakes: number) =>
    `${found}/${total} categories found · ${mistakes}/${o.maxMistakes} mistakes`

  // The viewer's own track. Solved and end-of-game-revealed bands print
  // IDENTICALLY — a category you worked out and one the game handed you look
  // the same, matching the screen (the revealed-band darkening was dropped
  // 2026-08-02 as imperceptible). The leftover grid excludes banded tiles:
  // before 2026-08-06 the terminal reveal printed every unsolved tile TWICE,
  // once in its revealed band and again below as a leftover.
  const viewerTrack = (who: string, guesses: GuessRow[], whoOf: (g: GuessRow) => string): PrintTrack => {
    const bands = [...o.matched, ...o.unmatched].map(toBand).sort((a, b) => a.rank - b.rank)
    const banded = new Set(bands.flatMap((b) => b.tiles))
    return {
      who,
      bands,
      remainingTiles: o.remainingTiles.filter((t) => !banded.has(t)),
      turns: turnsOf(guesses, whoOf),
      result: resultOf(o.matched.length, o.mistakes),
    }
  }

  // A rival's track, reconstructed from their guesses (open at terminal):
  // only the bands THEY earned; everything else stays the plain tile grid
  // (in category order — their board's own shuffle isn't what the printout
  // is about). The full answer already prints once, on the viewer's track.
  const rivalTrack = (p: { user_id: string; username: string }): PrintTrack => {
    const guesses = o.guesses.filter((g) => g.user_id === p.user_id)
    const solved = new Set(
      guesses
        .filter((g) => g.result === 'correct' && g.matched_category_rank != null)
        .map((g) => g.matched_category_rank as CategoryRank),
    )
    const mistakes = guesses.filter((g) => g.result !== 'correct').length
    return {
      who: p.username,
      bands: o.categories.filter((c) => solved.has(c.rank)).map(toBand),
      remainingTiles: o.categories.filter((c) => !solved.has(c.rank)).flatMap((c) => c.tiles),
      turns: turnsOf(guesses, () => p.username),
      result: resultOf(solved.size, mistakes),
    }
  }

  let tracks: PrintTrack[]
  if (o.mode === 'coop') {
    // One shared board however many players are round it; the log names
    // whoever made each guess, in play order.
    tracks = [viewerTrack('Team', o.guesses, (g) => nameOf(g.user_id))]
  } else if (o.isTerminal) {
    tracks = o.players.map((p) =>
      p.user_id === o.selfId
        ? viewerTrack(
            `${p.username} (you)`,
            o.guesses.filter((g) => g.user_id === o.selfId),
            () => p.username,
          )
        : rivalTrack(p),
    )
  } else {
    // Mid-game compete: RLS means the viewer holds nobody's guesses but their
    // own, and empty rival tracks would read as "they haven't guessed".
    tracks = [viewerTrack('You', o.guesses.filter((g) => g.user_id === o.selfId), () => 'you')]
  }

  return {
    brand: o.brand,
    gameTitle: o.gameTitle,
    date: o.date,
    // Coop's header carries the team readout (each compete track carries its
    // own); compete's says only what the page holds.
    summary: o.mode === 'coop' ? tracks[0].result : `Compete · ${o.players.length} players`,
    setup: o.setup,
    mode: o.mode,
    tracks,
  }
}
