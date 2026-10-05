// cs-fixed-outcome-fix

import type { PrintHeader } from '@/common/pdf/frame'
import type { GEvent, GPlayer, GResult, GTile, GWord } from '../types'

/**
 * Build the strands print model — the pure half, away from jsPDF so the
 * judgment is testable without a renderer.
 *
 * The judgment worth testing is **what may be printed**. strands hides its
 * answer, so a printout must not reveal on paper what the screen withholds:
 * missed words only while the solution is shown, and — in compete — a rival's
 * board only once the game is over and `gd` has handed their rows over. Print
 * is just another surface for the same seat rule.
 */

/** One found word on a printed board. */
export type PrintWord = {
  word: string
  // Its tiles, in trace order.
  tiles: GTile[]
  // The spangram prints heavier — it's the word that names the theme.
  spangram: boolean
  // Nobody found it (only ever present while the solution is shown).
  missed: boolean
}

/** One row of a printed log. */
export type PrintTurn = {
  seq: number
  // The word submitted, in capitals — or, on a hint row, the stand-in "Hint
  // used": a hint has no word, and the printed column would otherwise show a
  // blank line where every other row carries text.
  word: string
  // Drives the leading glyph: the non-color encoding of the verdict. `hint` is
  // the fifth mark and the only one that isn't a verdict.
  mark: 'best' | 'find' | 'ok' | 'no' | 'hint'
  // The trailing note, only where the glyph doesn't already say it.
  note: string
}

/**
 * One player's page-column: their board's found words, their log, their result.
 *
 * Coop is a single shared track — the team has one board — so `who` is null
 * there and the column simply isn't labeled with a name.
 */
export type PrintTrack = {
  who: string | null
  words: PrintWord[]
  turns: PrintTurn[]
  // "6 words · 1 hint" — the line under the column's heading.
  summary: string
}

export type StrandsPrintModel = PrintHeader & {
  // All 48 tiles, row by row.
  tiles: GTile[]
  tracks: PrintTrack[]
}

/** The glyph a result earns. Mirrors the on-screen event log exactly — same
 *  ladder (best > find > ok), same single mark for every rejection. */
const MARK: Record<GResult, PrintTurn['mark']> = {
  spangram: 'best',
  theme: 'find',
  hint_word: 'ok',
  duplicate: 'no',
  too_short: 'no',
  invalid: 'no',
}

/** …and the note, only where the glyph doesn't already carry it. On screen the
 *  COLOR distinguishes a theme word from a valid one; on paper the glyph does,
 *  so the same three rejections keep their reason and the finds stay bare. */
const NOTE: Partial<Record<GResult, string>> = {
  duplicate: 'already found',
  too_short: 'too short',
  invalid: 'not a word',
}

function makeTurns(events: readonly GEvent[]): PrintTurn[] {
  return events.map((e, i) =>
    e.kind === 'hint'
      // A hint prints as its own row, matching the screen: same sequence, same
      // position, so a printed log and an on-screen one can be read side by
      // side.
      ? { seq: i + 1, word: 'Hint used', mark: 'hint' as const, note: '' }
      : { seq: i + 1, word: e.word.toUpperCase(), mark: MARK[e.result], note: NOTE[e.result] ?? '' },
  )
}

function makeSummary(nFoundWords: number, nHintsUsed: number): string {
  const w = `${nFoundWords} word${nFoundWords === 1 ? '' : 's'}`
  return nHintsUsed > 0 ? `${w} · ${nHintsUsed} hint${nHintsUsed === 1 ? '' : 's'}` : w
}

/**
 * A board's found words, plus — while the solution is shown — the ones it did
 * not find. `solution` is null until the game ends and while the reveal is off,
 * so "don't print the answer early" needs no separate rule here.
 */
function makeWords(found: readonly GWord[], solution: readonly GWord[] | null): PrintWord[] {
  const words: PrintWord[] = found.map((w) => ({ ...w, missed: false }))
  if (solution) {
    const got = new Set(found.map((w) => w.word))
    for (const w of solution) if (!got.has(w.word)) words.push({ ...w, missed: true })
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
 * Mid-game compete prints only my own track: `gd` holds no rival's board yet,
 * and their column would be an empty grid claiming they'd found nothing.
 */
export function buildStrandsPrintModel({
  header,
  tiles,
  mode,
  ended,
  players,
  me,
  events,
  nFoundWords,
  nHintsUsed,
  solution,
}: {
  header: PrintHeader
  tiles: GTile[]
  mode: 'coop' | 'compete'
  ended: boolean
  players: readonly GPlayer[]
  me: GPlayer & { board: NonNullable<GPlayer['board']> }
  // Every row I may see.
  events: readonly GEvent[]
  // Coop's track counts: the team's.
  nFoundWords: number
  nHintsUsed: number
  // The hidden words while the solution is shown, else null.
  solution: readonly GWord[] | null
}): StrandsPrintModel {
  /** A racer's track; a rival's is only built once the game has ended, when
   *  `gd` holds their board. */
  const makeRacerTrack = (p: GPlayer): PrintTrack => ({
    who: p.username,
    words: makeWords(p.board!.words, solution),
    turns: makeTurns(events.filter((e) => e.by === p)),
    summary: makeSummary(p.nFoundWords!, p.nHintsUsed),
  })

  const tracks: PrintTrack[] = mode === 'coop'
    ? [{
      who: null,
      words: makeWords(me.board.words, solution),
      turns: makeTurns(events),
      summary: makeSummary(nFoundWords, nHintsUsed),
    }]
    : (ended ? players : [me]).map(makeRacerTrack)

  return { ...header, tiles, tracks }
}
