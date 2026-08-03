import type { PrintHeader } from '../../common/pdf/frame'
import type { TurnRow } from '../../common/pdf/turnLog'
import type { GuessRow } from '../hooks/useGame'

/**
 * Build the wordiply print model — the pure half of print-to-PDF, kept away
 * from jsPDF so the JUDGMENT can be tested without a renderer.
 *
 * The judgment is mostly one rule: **wordiply's terminal-only reveal has to
 * survive onto paper.** On screen a player sees only their guess count during
 * play — length score, letter count and the longest possible word appear at
 * terminal and not before (docs/games/wordiply.md §2). A printout is just
 * another view of the same game, so a mid-game print must withhold exactly the
 * same things. Dumping `status` would leak all three, which is why the shaping
 * lives here with a test rather than inline in a menu effect.
 */

/** One player's terminal result — the compete scores block. */
export type PrintScore = {
  who: string
  lengthScore: number
  letterCount: number
  won: boolean
}

export type WordiplyPrintModel = PrintHeader & {
  /** The starter fragment every guess had to contain, uppercased. */
  base: string
  /** The turn log — accepted AND rejected, in play order. */
  turns: TurnRow[]
  /**
   * Terminal only (null during play). The longest word that was possible, and
   * its length — wordiply's headline reveal.
   */
  reveal: { word: string; length: number } | null
  /**
   * Compete at terminal only (empty otherwise): every player's final scores.
   * Coop has one shared result, which the header summary already carries.
   */
  scores: PrintScore[]
}

/** The reject reasons, in the log's terse voice — same words as on screen. */
const REJECT_LABEL: Record<NonNullable<GuessRow['reason']>, string> = {
  missing_base: 'no base',
  too_short: 'too short',
  not_a_word: 'not a word',
}

/**
 * A guess as one printed line. Accepted words carry their length; rejects carry
 * why instead.
 *
 * **This has to read in black and white.** Colour is the only thing separating
 * an accepted row from a rejected one on screen (the outcome bar), and a mono
 * printer flattens that — the psychicnum printer draws ✓/✗ shapes for exactly
 * this reason. Here the text already says it (`— not a word`), so no mark is
 * needed; keep it that way rather than adding one.
 */
const turnText = (g: GuessRow): string =>
  g.valid
    ? `${g.word.toUpperCase()} (${g.length})`
    : `${g.word.toUpperCase()} — ${REJECT_LABEL[g.reason ?? 'not_a_word']}`

export function buildWordiplyPrintModel(o: {
  brand: string
  gameTitle: string
  date: string
  base: string
  maxWordLength: number
  /** The longest possible word, from the board — the game's solution. */
  longestWord: string | null
  /** `common.games.solution_revealed`: may the solution be shown? wordiply
   *  doesn't hide it (gametypes.hides_solution = false), so this is true at
   *  every ending — but the printout reads the same canonical flag the screen
   *  does rather than re-deciding with `isTerminal`. */
  solutionRevealed: boolean
  mode: 'coop' | 'compete'
  isTerminal: boolean
  /** EVERY row the viewer may see — the log prints rejects too. */
  guesses: GuessRow[]
  players: { user_id: string; username: string }[]
  selfId: string
  /** Accepted-guess count, the one live readout. */
  guessesUsed: number
  maxGuesses: number
  /** Terminal totals for the header summary (coop: the team's; compete: mine). */
  lengthScore: number
  letterCount: number
  /** Terminal compete only: per-player scores off `status.leaderboard`. */
  leaderboard: { user_id: string; length_score?: number; letter_count?: number; won?: boolean }[]
  setup: { label: string; value: string }[]
}): WordiplyPrintModel {
  const nameOf = (userId: string) =>
    o.players.find((p) => p.user_id === userId)?.username ?? 'someone'

  // Compete tracks are PARALLEL races, not one shared sequence, so interleaving
  // them chronologically would read as nonsense. Sorting by player (self first)
  // then by time groups each player's run into a block while staying one table —
  // the `who` column labels them, so no new helper is needed. Coop IS one shared
  // sequence, so it stays in play order.
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

  // Numbered by LOG POSITION, not `seq`: rejects have no seq (they occupy no
  // board row), and a printed wordiply has no board for the numbers to line up
  // with anyway. So `#3` means "the third thing that happened".
  const turns: TurnRow[] = ordered.map((g, i) => ({
    seq: i + 1,
    who: nameOf(g.user_id),
    text: turnText(g),
  }))

  // The terminal-only rule, in one place. Mid-game the summary is the guess
  // count and nothing else; the reveal and the scores block don't render.
  const summary = o.isTerminal
    ? `Starter ${o.base.toUpperCase()} · Length score ${o.lengthScore}% · ` +
      `${o.letterCount} letters across ${o.guessesUsed} guess${o.guessesUsed === 1 ? '' : 'es'}`
    : `Starter ${o.base.toUpperCase()} · ${o.guessesUsed} / ${o.maxGuesses} guesses`

  const scores: PrintScore[] =
    o.isTerminal && o.mode === 'compete'
      ? o.players.map((p) => {
          const row = o.leaderboard.find((e) => e.user_id === p.user_id)
          return {
            who: p.username,
            lengthScore: row?.length_score ?? 0,
            letterCount: row?.letter_count ?? 0,
            won: row?.won ?? false,
          }
        })
      : []

  return {
    brand: o.brand,
    gameTitle: o.gameTitle,
    date: o.date,
    summary,
    setup: o.setup,
    base: o.base.toUpperCase(),
    turns,
    reveal:
      o.solutionRevealed && o.longestWord
        ? { word: o.longestWord.toUpperCase(), length: o.maxWordLength }
        : null,
    scores,
  }
}
