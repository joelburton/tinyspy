import type { PrintHeader, SetupRow } from '../../common/pdf/frame'
import type { TurnRow } from '../../common/pdf/turnLog'
import { BOARD_SIZE, coveredLetters } from '../lib/board'
import type { EventRow, PlayerRow } from '../hooks/useGame'
import type { GamePlayer } from '../../common/lib/games'

/**
 * Build the letterboxed print model — the pure half, away from jsPDF so the
 * judgments are testable without a renderer.
 *
 * Two judgments live here.
 *
 * **The solution is not printed unless it has already been revealed on screen.**
 * The FE holds the seeded pair from game start, and the terminal Reveal button
 * is what opens it (`hides_solution` on the gametype). Printing it regardless
 * would route around that gate — a player could take the answer off a game they
 * had deliberately left covered, and hand it to someone still playing.
 *
 * **Compete gets one track per player**, because each builds a DIFFERENT chain
 * on the same twelve letters. A single merged log would interleave chains that
 * never met, and the covered-letter marking on a shared board would be the union
 * of everyone's progress, which is nobody's position.
 */

/** One player's page-column: their board marking, their chain, their moves. */
export type PrintTrack = {
  who: string
  /** The words they played, in order. */
  chain: string[]
  /** Board letters this player has covered — drives the board marking. */
  covered: string[]
  turns: TurnRow[]
  /** Their own one-line standing ("7/12 letters · 2 words"). */
  result: string
}

export type LetterboxedPrintModel = PrintHeader & {
  /** Twelve letters in side order — positions 0-2 are one side, and so on. */
  sides: string
  /** One track per board. Coop is a single shared track (one chain); compete is
   *  one per player. */
  tracks: PrintTrack[]
  /** The seeded pair — null unless the players have revealed it. */
  solution: string[] | null
}

/** What a move row says on paper. Mirrors the on-screen log's vocabulary. */
function describe(e: EventRow): string {
  const word = e.word?.toUpperCase() ?? ''
  switch (e.kind) {
    case 'played':
      return `${word} (${e.letters_covered}/${BOARD_SIZE})`
    case 'undone':
      return `took back ${word}`
    case 'cleared':
      return 'started over'
    case 'hint':
      return 'took a hint'
    case 'spoiler':
      return `was shown ${word}`
  }
}

export function buildLetterboxedPrintModel(o: {
  brand: string
  gameTitle: string
  date: string
  sides: string
  mode: 'coop' | 'compete'
  solution: string[]
  /** The shared reveal flag — the ONLY thing that lets the solution print. */
  solutionRevealed: boolean
  players: GamePlayer[]
  playerRows: PlayerRow[]
  events: EventRow[]
  selfId: string
  /** The on-screen status line, repeated under the title. */
  summary: string
  setup: SetupRow[]
}): LetterboxedPrintModel {
  const header: PrintHeader = {
    brand: o.brand,
    gameTitle: o.gameTitle,
    date: o.date,
    summary: o.summary,
    setup: o.setup,
    mode: o.mode,
  }

  const trackFor = (who: string, chain: string[], rows: EventRow[]): PrintTrack => ({
    who,
    chain,
    covered: [...coveredLetters(chain)],
    turns: rows.map((e, i) => ({
      seq: i + 1,
      who: o.players.find((p) => p.user_id === e.user_id)?.username ?? '—',
      text: describe(e),
    })),
    result: `${coveredLetters(chain).size}/${BOARD_SIZE} letters · ${chain.length} ${
      chain.length === 1 ? 'word' : 'words'
    }`,
  })

  // Coop is ONE chain the whole table shares, so the column is about the board
  // rather than a person — hence "Team", the same word wordle's coop track uses.
  if (o.mode === 'coop') {
    const chain = o.playerRows[0]?.chain ?? []
    return {
      ...header,
      sides: o.sides,
      tracks: [trackFor('Team', chain, o.events)],
      solution: o.solutionRevealed ? o.solution : null,
    }
  }

  // Compete: one track per player whose chain we can actually see. A rival's
  // chain is null mid-race (players_state masks it), so their column would be a
  // blank board — printing yours alone is the honest thing during play, and at
  // terminal the mask opens and everyone gets a column.
  const tracks = o.players
    .map((p) => {
      const row = o.playerRows.find((r) => r.user_id === p.user_id)
      if (!row?.chain) return null
      const mine = o.events.filter((e) => e.user_id === p.user_id)
      return trackFor(p.username, row.chain, mine)
    })
    .filter((t): t is PrintTrack => t !== null)

  return {
    ...header,
    sides: o.sides,
    tracks,
    solution: o.solutionRevealed ? o.solution : null,
  }
}
