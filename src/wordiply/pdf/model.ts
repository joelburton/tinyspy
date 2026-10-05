// cs-fixed-outcome-fix

import type { PrintHeader , SetupRow } from '@/common/pdf/frame'
import type { TurnRow } from '@/common/pdf/eventLog'
import { getRejectLabel } from '../lib/answer'
import type { GEvent, GGameData, GPlayer, GStateLineData } from '../types'

/**
 * Build the wordiply print model — the pure half of print-to-PDF, kept away
 * from jsPDF so the JUDGMENT can be tested without a renderer.
 *
 * The judgment is mostly one rule: **wordiply's end-only reveal has to survive
 * onto paper.** On screen a player sees only their guess count during play —
 * length score, letter count and the longest possible word appear at the end
 * and not before (docs/games/wordiply.md §2). A printout is just another view
 * of the same game, so a mid-game print must withhold exactly the same things.
 */

/** One player's final result — the compete scores block. */
export type PrintScore = {
  who: string
  lengthScore: number
  nLetters: number
  won: boolean
}

export type WordiplyPrintModel = PrintHeader & {
  /** The starter fragment every guess had to contain, uppercased. */
  base: string
  /** The event log — accepted AND rejected, in play order. */
  turns: TurnRow[]
  /**
   * While the best possible word is revealed on screen (null otherwise): the
   * word and its length — wordiply's headline reveal.
   */
  reveal: { word: string; length: number } | null
  /**
   * Compete once ended only (empty otherwise): every player's final scores.
   * Coop has one shared result, which the header summary already carries.
   */
  scores: PrintScore[]
}

/**
 * A guess as one printed line. Accepted words carry their length; rejects carry
 * why instead.
 *
 * **This has to read in black and white.** Color is the only thing separating
 * an accepted row from a rejected one on screen (the outcome bar), and a mono
 * printer flattens that — the psychicnum printer draws ✓/✗ shapes for exactly
 * this reason. Here the text already says it (`— not a word`), so no mark is
 * needed; keep it that way rather than adding one.
 */
const turnText = (e: GEvent): string =>
  e.valid
    ? `${e.word.toUpperCase()} (${e.word.length})`
    : `${e.word.toUpperCase()} — ${getRejectLabel(e.reason)}`

export function buildWordiplyPrintModel(o: {
  brand: string
  gameTitle: string
  date: string
  mode: 'coop' | 'compete'
  isGameEnded: boolean
  puzzle: GGameData['puzzle']
  /** Is the best possible word on screen right now (the local reveal toggle)?
   *  The paper carries the answer only if the page in front of the printer
   *  does — printing it regardless would route around the Reveal button and
   *  hand the word to a table still guessing at it. */
  solutionShown: boolean
  /** EVERY row the viewer may see — the log prints rejects too. */
  events: GEvent[]
  players: GPlayer[]
  me: GPlayer
  /** The header summary's numbers: the team's track in coop, mine in compete
   *  (`gd.stateLineData`). Its scores are null until the end. */
  track: GStateLineData
  setupRows: SetupRow[]
}): WordiplyPrintModel {
  // Compete tracks are PARALLEL races, not one shared sequence, so interleaving
  // them chronologically would read as nonsense. Sorting by player (me first)
  // then by time groups each player's run into a block while staying one table —
  // the `who` column labels them, so no new helper is needed. Coop IS one shared
  // sequence, so it stays in play order.
  const ordered =
    o.mode === 'compete'
      ? [...o.events].sort((a, b) => {
          if (a.by !== b.by) {
            if (a.by === o.me) return -1
            if (b.by === o.me) return 1
            return a.by.username.localeCompare(b.by.username)
          }
          return a.id - b.id
        })
      : o.events

  // Numbered by LOG POSITION: a reject occupies no board line, and a printed
  // wordiply has no board for the numbers to line up with anyway. So `#3`
  // means "the third thing that happened".
  const turns: TurnRow[] = ordered.map((e, i) => ({
    seq: i + 1,
    who: e.by.username,
    text: turnText(e),
  }))

  // The end-only rule, in one place. Mid-game the summary is the guess count
  // and nothing else; the scores block doesn't render.
  const base = o.puzzle.base.toUpperCase()
  const nUsed = o.track.nGuessesUsed
  const summary = o.isGameEnded
    ? `Starter ${base} · Length score ${o.track.lengthScore}% · ` +
      `${o.track.nLetters} letters across ${nUsed} guess${nUsed === 1 ? '' : 'es'}`
    : `Starter ${base} · ${nUsed} / ${o.track.maxGuesses} guesses`

  // A player's scores are written once the game has ended.
  const scores: PrintScore[] =
    o.isGameEnded && o.mode === 'compete'
      ? o.players.map((p) => ({
          who: p.username,
          lengthScore: p.lengthScore!,
          nLetters: p.nLetters!,
          won: p.outcome === 'won',
        }))
      : []

  const bestWord = o.puzzle.longestWords[0] ?? null
  return {
    brand: o.brand,
    gameTitle: o.gameTitle,
    date: o.date,
    summary,
    setupRows: o.setupRows,
    mode: o.mode,
    base,
    turns,
    reveal:
      o.solutionShown && bestWord
        ? { word: bestWord.toUpperCase(), length: o.puzzle.maxWordLen }
        : null,
    scores,
  }
}
