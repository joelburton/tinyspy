// cs-blessed-connections

import type { PrintHeader, SetupRow } from '@/common/pdf/frame'
import type { TurnRow } from '@/common/pdf/eventLog'
import type { GCatRank, GCategory, GEvent, GMatchedCat } from '../types'
import { memberById } from '@/common/members/memberList'

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
export const RANK_LETTER: Record<GCatRank, string> = { 0: 'A', 1: 'B', 2: 'C', 3: 'D' }

/** One solved (or end-of-game revealed) category, as printed. */
export type PrintBand = {
  rank: GCatRank
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
  tilesLeft: string[]
  turns: TurnRow[]
  // Their own readout ("2/4 categories found · 3/4 mistakes").
  result: string
}

export type ConnectionsPrintModel = PrintHeader & {
  // Coop is a single shared track; compete is one per player once the game
  // has ended, or just yours during play (a rival's guesses are withheld
  // until then).
  tracks: PrintTrack[]
}

/**
 * The verdict, kept SHORT: the log line is one row, four tiles fill most of
 * it, and a long category can still ellipsize its last tile — so the verdict
 * leads, where it always survives. A correct guess shows its band's letter.
 */
function verdict(g: GEvent): string {
  if (g.matched) {
    return g.matchedCatRank !== null ? RANK_LETTER[g.matchedCatRank] : 'match'
  }
  return g.outcome === 'near' ? '1 away' : 'miss'
}

function toBand(c: GCategory): PrintBand {
  return { rank: c.rank, letter: RANK_LETTER[c.rank], name: c.name, tiles: c.tiles }
}

export function buildConnectionsPrintModel(o: {
  brand: string
  gameTitle: string
  date: string
  // All four categories (public in both modes).
  cats: GCategory[]
  // The viewer's solved categories.
  matchedCats: GMatchedCat[]
  // Revealed at game-end; `[]` during play.
  unmatchedCats: GCategory[]
  // Tiles still on the viewer's board, in display order.
  tilesLeft: string[]
  guesses: GEvent[]
  players: { id: string; username: string }[]
  myId: string
  mode: 'coop' | 'compete'
  isGameEnded: boolean
  nMistakes: number
  maxMistakes: number
  setupRows: SetupRow[]
}): ConnectionsPrintModel {
  const nameOf = (userId: string) => memberById(o.players, userId)?.username ?? 'someone'
  const total = o.cats.length

  const turnsOf = (guesses: GEvent[], whoOf: (g: GEvent) => string): TurnRow[] =>
    guesses.map((g, i) => ({ seq: i + 1, who: whoOf(g), text: `${verdict(g)}: ${g.tiles.join(' · ')}` }))

  const resultOf = (found: number, mistakes: number) =>
    `${found}/${total} categories found · ${mistakes}/${o.maxMistakes} mistakes`

  // The viewer's own track. Solved and end-of-game-revealed bands print
  // IDENTICALLY — a category you worked out and one the game handed you look
  // the same, matching the screen. The leftover grid excludes banded tiles, so
  // a revealed category's words print once.
  const viewerTrack = (who: string, guesses: GEvent[], whoOf: (g: GEvent) => string): PrintTrack => {
    const bands = [...o.matchedCats, ...o.unmatchedCats].map(toBand).sort((a, b) => a.rank - b.rank)
    const banded = new Set(bands.flatMap((b) => b.tiles))
    return {
      who,
      bands,
      tilesLeft: o.tilesLeft.filter((t) => !banded.has(t)),
      turns: turnsOf(guesses, whoOf),
      result: resultOf(o.matchedCats.length, o.nMistakes),
    }
  }

  // A rival's track, reconstructed from their guesses (open once the game has
  // ended): only the bands THEY earned; everything else stays the plain tile
  // grid (in category order — their board's own shuffle isn't what the
  // printout is about). The full answer already prints once, on the viewer's
  // track.
  const rivalTrack = (p: { id: string; username: string }): PrintTrack => {
    const guesses = o.guesses.filter((g) => g.by.id === p.id)
    const solved = new Set(
      guesses
        .filter((g) => g.matched && g.matchedCatRank !== null)
        .map((g) => g.matchedCatRank!),
    )
    const mistakes = guesses.filter((g) => !g.matched).length
    return {
      who: p.username,
      bands: o.cats.filter((c) => solved.has(c.rank)).map(toBand),
      tilesLeft: o.cats.filter((c) => !solved.has(c.rank)).flatMap((c) => c.tiles),
      turns: turnsOf(guesses, () => p.username),
      result: resultOf(solved.size, mistakes),
    }
  }

  let tracks: PrintTrack[]
  if (o.mode === 'coop') {
    // One shared board however many players are round it; the log names
    // whoever made each guess, in play order.
    tracks = [viewerTrack('Team', o.guesses, (g) => nameOf(g.by.id))]
  } else if (o.isGameEnded) {
    tracks = o.players.map((p) =>
      p.id === o.myId
        ? viewerTrack(
            `${p.username} (you)`,
            o.guesses.filter((g) => g.by.id === o.myId),
            () => p.username,
          )
        : rivalTrack(p),
    )
  } else {
    // Mid-game compete: the viewer holds nobody's guesses but their own, and
    // empty rival tracks would read as "they haven't guessed".
    tracks = [viewerTrack('You', o.guesses.filter((g) => g.by.id === o.myId), () => 'you')]
  }

  return {
    brand: o.brand,
    gameTitle: o.gameTitle,
    date: o.date,
    // Coop's header carries the team readout (each compete track carries its
    // own); compete's says only what the page holds.
    summary: o.mode === 'coop' ? tracks[0].result : `Compete · ${o.players.length} players`,
    setupRows: o.setupRows,
    mode: o.mode,
    tracks,
  }
}
