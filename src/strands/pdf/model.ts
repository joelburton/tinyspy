import type { PrintHeader } from '../../common/pdf/frame'
import type { Coord } from '../lib/board'
import type { EventRow, GuessResult, StrandsPlayer, StrandsSolution } from '../hooks/useGame'
import type { Member } from '../../common/lib/games'

/**
 * Build the strands print model — the pure half, away from jsPDF so the
 * judgment is testable without a renderer.
 *
 * The judgment worth testing is **what may be printed**. strands hides its
 * answer, so a printout must not reveal on paper what the screen withholds:
 * missed words only once the solution is revealed, and — in compete — a rival's
 * board only once the game is over and RLS has actually handed their guesses
 * over. Print is just another surface for the same shield.
 */

/** One found word on a printed board. */
export type PrintWord = {
  word: string
  coords: Coord[]
  /** The spangram prints heavier — it's the word that names the theme. */
  isSpangram: boolean
  /** Nobody found it (only ever present once the solution is revealed). */
  missed: boolean
}

/** One row of a printed log. */
export type PrintTurn = {
  seq: number
  /** The word submitted — or, on a hint row, the stand-in "Hint used": a hint
   *  has no word, and the printed column would otherwise show a blank line
   *  where every other row carries text. */
  word: string
  /** Drives the leading glyph: the non-colour encoding of the verdict.
   *  `hint` is the fifth mark and the only one that isn't a verdict. */
  mark: 'best' | 'find' | 'ok' | 'no' | 'hint'
  /** The trailing note, only where the glyph doesn't already say it. */
  note: string
}

/**
 * One player's page-column: their board's found words, their log, their result.
 *
 * Coop is a single shared track — the team has one board — so `who` is null
 * there and the column simply isn't labelled with a name.
 */
export type PrintTrack = {
  who: string | null
  words: PrintWord[]
  turns: PrintTurn[]
  /** "6 words · 1 hint" — the line under the column's heading. */
  summary: string
}

export type StrandsPrintModel = PrintHeader & {
  /** 8 rows of 6 letters. */
  board: string[]
  tracks: PrintTrack[]
}

/** The glyph a result earns. Mirrors the on-screen turn log exactly — same
 *  ladder (best > find > ok), same single mark for every rejection. */
const MARK: Record<GuessResult, PrintTurn['mark']> = {
  spangram: 'best',
  theme: 'find',
  hint_word: 'ok',
  duplicate: 'no',
  too_short: 'no',
  invalid: 'no',
}

/** …and the note, only where the glyph doesn't already carry it. On screen the
 *  COLOUR distinguishes a theme word from a valid one; on paper the glyph does,
 *  so the same three rejections keep their reason and the finds stay bare. */
const NOTE: Partial<Record<GuessResult, string>> = {
  duplicate: 'already found',
  too_short: 'too short',
  invalid: 'not a word',
}

function turnsOf(rows: readonly EventRow[]): PrintTurn[] {
  return rows.map((row, i) =>
    row.kind === 'hint'
      // A hint prints as its own row, matching the screen: same sequence, same
      // position, so a printed log and an on-screen one can be read side by
      // side. "Hint used" sits in the word slot for want of a word — which is
      // the fact the row is reporting.
      ? { seq: i + 1, word: 'Hint used', mark: 'hint' as const, note: '' }
      : {
        seq: i + 1,
        word: row.word.toUpperCase(),
        mark: MARK[row.result],
        note: NOTE[row.result] ?? '',
      },
  )
}

function summaryOf(found: number, hints: number): string {
  const w = `${found} word${found === 1 ? '' : 's'}`
  return hints > 0 ? `${w} · ${hints} hint${hints === 1 ? '' : 's'}` : w
}

/**
 * Found words for one player, plus — once revealed — the ones nobody found.
 *
 * The missed set is computed from the same `solution` the screen uses, which is
 * null until `common.games.solution_revealed`. So "don't print the answer early"
 * needs no separate rule here: there is simply nothing to print.
 */
/** A row `isFind` has narrowed to: a guess that landed a theme word. */
type FoundEvent = Extract<EventRow, { kind: 'guess' }>

function wordsOf(
  found: readonly FoundEvent[],
  solution: StrandsSolution | null,
): PrintWord[] {
  const words: PrintWord[] = found.map((g) => ({
    word: g.word.toUpperCase(),
    coords: g.path,
    isSpangram: g.result === 'spangram',
    missed: false,
  }))

  if (solution) {
    const got = new Set(found.map((g) => g.word))
    for (const [w, isSpangram] of [
      [solution.spangram, true] as const,
      ...solution.themeWords.map((t) => [t, false] as const),
    ]) {
      if (got.has(w.word)) continue
      words.push({ word: w.word.toUpperCase(), coords: w.coords, isSpangram, missed: true })
    }
  }
  return words
}

/**
 * Build the model.
 *
 * **One track in coop, one per player in compete** — because in compete each
 * player really does have a different board over the same letters, and a single
 * merged column would file one racer's words under another's grid.
 *
 * Mid-game compete prints only the caller's track, and that isn't a display
 * choice: RLS hasn't given us anyone else's guesses, so their column would be
 * an empty grid claiming they'd found nothing. Better to print what is known
 * than to print a confident falsehood.
 */
export function buildPrintModel(args: {
  header: PrintHeader
  board: string[]
  mode: 'coop' | 'compete'
  isTerminal: boolean
  events: readonly EventRow[]
  players: readonly Member[]
  playerStates: readonly StrandsPlayer[]
  selfId: string
  solution: StrandsSolution | null
}): StrandsPrintModel {
  // A type predicate, not a plain boolean: it narrows the row to a GUESS, which
  // is what lets `wordsOf` read `.word` without a null check. A find is by
  // definition a guess — a hint row has no verdict to match.
  const isFind = (e: EventRow): e is FoundEvent =>
    e.result === 'theme' || e.result === 'spangram'

  const trackFor = (userId: string | null): PrintTrack => {
    const rows = userId === null ? args.events : args.events.filter((e) => e.user_id === userId)
    const hints = userId === null
      // Coop's pool is shared, so every row carries the same spend — reading one
      // is reading the team's.
      ? (args.playerStates[0]?.hints_spent ?? 0)
      : (args.playerStates.find((p) => p.user_id === userId)?.hints_spent ?? 0)
    const found = rows.filter(isFind)
    return {
      who: userId === null
        ? null
        : (args.players.find((p) => p.user_id === userId)?.username ?? 'someone'),
      words: wordsOf(found, args.solution),
      turns: turnsOf(rows),
      summary: summaryOf(found.length, hints),
    }
  }

  const tracks =
    args.mode === 'coop'
      ? [trackFor(null)]
      : args.isTerminal
        ? args.players.map((p) => trackFor(p.user_id))
        : [trackFor(args.selfId)]

  return {
    ...args.header,
    board: args.board,
    tracks,
  }
}
