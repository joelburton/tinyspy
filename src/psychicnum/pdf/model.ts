import type { PrintHeader, SetupRow } from '../../common/pdf/frame'
import type { TurnRow } from '../../common/pdf/turnLog'
import type { GuessRow } from '../hooks/useGame'

/**
 * Build the psychicnum print model — the pure half, away from jsPDF so the
 * judgment is testable without a renderer (the same split as wordle/stackdown).
 *
 * The judgment that lives here: **whose marks belong on whose board.** The
 * board WORDS are shared, but in compete every player races their own copy —
 * each with their own ✓/✗ marks, their own score and their own guess log — so
 * the printout is one track per player (`common/pdf/columns.ts`), not one
 * merged board that silently blends everyone's guesses (which is exactly what
 * the old single-board printer did at compete terminal).
 */

export type PrintTile = { word: string; state: 'correct' | 'miss' | 'undecided' }

/** One player's page-column: their board, their score line, their guesses. */
export type PrintTrack = {
  who: string
  board: PrintTile[]
  turns: TurnRow[]
  /** Their own score line ("2 of 3 secrets found · 4 guesses used"). */
  result: string
}

export type PsychicnumPrintModel = PrintHeader & {
  /** Grid columns (rows derive from `board.length`). */
  cols: number
  /** Coop is a single shared track; compete is one per player at terminal,
   *  or just yours during play (RLS hides rivals' guesses until then). */
  tracks: PrintTrack[]
}

/** Fold one set of guesses into the shared words' per-tile states. */
function boardOf(words: readonly string[], guesses: readonly GuessRow[]): PrintTile[] {
  const results = new Map<string, boolean>()
  for (const g of guesses) if (g.kind === 'guess') results.set(g.word, g.is_correct)
  return words.map((w) => ({
    word: w.toUpperCase(),
    state: results.has(w) ? (results.get(w) ? 'correct' : 'miss') : 'undecided',
  }))
}

/** The on-screen turn-log wording, one row per guess/hint/reveal. */
function turnsOf(guesses: readonly GuessRow[], whoOf: (g: GuessRow) => string): TurnRow[] {
  return guesses.map((g, i) => ({
    seq: i + 1,
    who: whoOf(g),
    text:
      g.kind === 'hint'
        ? `Hint: ${g.word}`
        : g.kind === 'reveal'
          ? `${g.word.toUpperCase()} — Answer`
          : `${g.word.toUpperCase()} — ${g.is_correct ? 'Correct' : 'Incorrect'}`,
  }))
}

export function buildPsychicnumPrintModel(o: {
  brand: string
  gameTitle: string
  date: string
  mode: 'coop' | 'compete'
  isTerminal: boolean
  /** The shared board words (lowercase, as the row stores them). */
  words: readonly string[]
  /** Every guess the viewer can see. Compete mid-game: only their own. */
  guesses: GuessRow[]
  players: { user_id: string; username: string }[]
  selfId: string
  setup: SetupRow[]
}): PsychicnumPrintModel {
  const nameOf = (id: string) => o.players.find((p) => p.user_id === id)?.username ?? 'someone'

  const track = (who: string, guesses: GuessRow[], whoOf: (g: GuessRow) => string): PrintTrack => {
    const board = boardOf(o.words, guesses)
    const found = board.filter((t) => t.state === 'correct').length
    const used = guesses.filter((g) => g.kind === 'guess').length
    return {
      who,
      board,
      turns: turnsOf(guesses, whoOf),
      result: `${found} of 3 secrets found · ${used} guess${used === 1 ? '' : 'es'} used`,
    }
  }

  // Coop is ONE shared board however many players are round it, so it's one
  // track and the log names whoever made each guess. Compete is one track per
  // player — but only at terminal, since mid-game RLS means the viewer holds
  // nobody's guesses but their own and empty rival tracks would be misleading.
  let tracks: PrintTrack[]
  if (o.mode === 'coop') {
    tracks = [track('Team', o.guesses, (g) => nameOf(g.user_id))]
  } else if (o.isTerminal) {
    tracks = o.players.map((p) =>
      track(
        p.user_id === o.selfId ? `${p.username} (you)` : p.username,
        o.guesses.filter((g) => g.user_id === p.user_id),
        () => p.username,
      ),
    )
  } else {
    tracks = [
      track('You', o.guesses.filter((g) => g.user_id === o.selfId), () => 'you'),
    ]
  }

  return {
    brand: o.brand,
    gameTitle: o.gameTitle,
    date: o.date,
    // Coop's header line carries the team score (each compete track carries
    // its own); compete's says only what the page holds.
    summary: o.mode === 'coop' ? `Co-op · ${tracks[0].result}` : `Compete · ${o.players.length} players`,
    setup: o.setup,
    mode: o.mode,
    cols: Math.ceil(Math.sqrt(o.words.length)),
    tracks,
  }
}
