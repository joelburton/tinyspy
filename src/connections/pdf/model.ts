// cs-blessed-connections

import type { PrintHeader, SetupRow } from '@/common/pdf/frame'
import type { TurnRow } from '@/common/pdf/eventLog'
import type { Category, CategoryRank } from '../lib/board'
import type { EventRow, MatchedCategory } from '../hooks/useGame'

/**
 * Build the connections print model — the pure half, away from jsPDF so the
 * judgment is testable without a renderer.
 *
 * Two judgments live here. **What a band carries on paper**: a letter A–D for
 * its rank, the signal that survives a mono printer (doc.md → Frontend, the
 * printer). **Whose bands belong on whose board**: compete racers each play
 * their own copy, so the printout is one track per player
 * (`common/pdf/columns.ts`) — the full solution once, on the viewer's, and a
 * rival's showing only what they earned.
 */

/** rank → the printed letter. Rank 0..3 is NYT's difficulty order. */
export const RANK_LETTER: Record<CategoryRank, string> = { 0: 'A', 1: 'B', 2: 'C', 3: 'D' }

/** One solved (or end-of-game revealed) category, as printed. */
export type PrintBand = {
  rank: CategoryRank
  // A–D. The B&W-safe stand-in for the band color.
  letter: string
  name: string
  tiles: string[]
}

/** One player's page-column: their bands, their leftover tiles, their log. */
export type PrintTrack = {
  who: string
  // Bands to draw, in rank order.
  bands: PrintBand[]
  // Tiles not in any of THIS track's bands — `[]` once all four are shown.
  remainingTiles: string[]
  turns: TurnRow[]
  // Their own readout ("2/4 categories found · 3/4 mistakes").
  result: string
}

export type ConnectionsPrintModel = PrintHeader & {
  // Coop is a single shared track; compete is one per player at terminal,
  // or just yours during play (RLS hides rivals' guesses until then).
  tracks: PrintTrack[]
}

/**
 * The verdict, kept SHORT: the log line is one row, four tiles fill most of
 * it, and a long category can still ellipsize its last tile — so the verdict
 * leads, where it always survives. A correct guess shows its band's letter.
 */
function verdict(g: EventRow): string {
  if (g.matched) {
    return g.matched_category_rank != null
      ? RANK_LETTER[g.matched_category_rank as CategoryRank]
      : 'match'
  }
  return g.outcome === 'near' ? '1 away' : 'miss'
}

function toBand(c: Category): PrintBand {
  return { rank: c.rank, letter: RANK_LETTER[c.rank], name: c.name, tiles: c.tiles }
}

export function buildConnectionsPrintModel(o: {
  brand: string
  gameTitle: string
  date: string
  // All four categories (public in both modes).
  categories: Category[]
  // The viewer's solved categories.
  matched: MatchedCategory[]
  // Revealed at game-end; `[]` during play.
  unmatched: Category[]
  // Tiles still on the viewer's board, in display order.
  remainingTiles: string[]
  guesses: EventRow[]
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

  const turnsOf = (guesses: EventRow[], whoOf: (g: EventRow) => string): TurnRow[] =>
    guesses.map((g, i) => ({ seq: i + 1, who: whoOf(g), text: `${verdict(g)}: ${g.tiles.join(' · ')}` }))

  const resultOf = (found: number, mistakes: number) =>
    `${found}/${total} categories found · ${mistakes}/${o.maxMistakes} mistakes`

  // The viewer's own track. Solved and end-of-game-revealed bands print
  // IDENTICALLY — a category you worked out and one the game handed you look
  // the same, matching the screen. The leftover grid excludes banded tiles, so
  // a revealed category's words print once.
  const viewerTrack = (who: string, guesses: EventRow[], whoOf: (g: EventRow) => string): PrintTrack => {
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
        .filter((g) => g.matched && g.matched_category_rank != null)
        .map((g) => g.matched_category_rank as CategoryRank),
    )
    const mistakes = guesses.filter((g) => !g.matched).length
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
