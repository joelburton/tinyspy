// cs-unmet

import type { PrintHeader , SetupRow } from '@/common/pdf/frame'
import type { TurnRow } from '@/common/pdf/eventLog'
import { getTileColor, type TileColor } from '@/shared/wordle-style/tileColor'
import { makeKeyColors } from '../lib/colors'
import type { GBoardRow, GEvent } from '../types'

/**
 * Build the wordleone print model — the pure half, away from jsPDF so the
 * judgment is testable without a renderer.
 *
 * Two judgments live here. **The target is a secret**: it's on the blob once
 * the game has ended and the FE holds it, but it must not print before it
 * shows on screen. And **the keyboard is derived, not stored** — the best
 * state each letter earned on that player's board, the starter and the solve —
 * so it is recomputed per player rather than shared.
 */

/** One board row: five tiles, or five blanks for a row not yet played. */
export type PrintRow = { letters: string[]; states: TileColor[] }

/** One player's page-column: their board, their keyboard, their guesses. */
export type PrintTrack = {
  who: string
  // The starter, then the solve or a blank row.
  rows: PrintRow[]
  // letter → best state seen. Absent letters are untried ('blank').
  keys: Map<string, TileColor>
  // Every guess, the misses included, as plain words.
  turns: TurnRow[]
  // Their own outcome line ("Solved, 2 misses" / "Did not solve").
  result: string
}

export type PrintModel = PrintHeader & {
  // One track per board. Coop is a single shared track; compete is one per
  // player once the game has ended, or just yours during play.
  tracks: PrintTrack[]
  // The answer — only while it is shown on screen, else null.
  target: string | null
}

const BLANK_ROW = (len: number): PrintRow => ({
  letters: Array(len).fill(''),
  states: Array(len).fill('blank' as TileColor),
})

/** A colored board row → its tiles. */
function rowOf(r: { word: string; colors: string }): PrintRow {
  return {
    letters: [...r.word.toUpperCase()],
    states: [...r.word].map((_, i) => getTileColor(r.colors[i])),
  }
}

/** "1 miss" / "3 misses". */
function misses(n: number): string {
  return `${n} ${n === 1 ? 'miss' : 'misses'}`
}

export function buildPrintModel(o: {
  brand: string
  gameTitle: string
  date: string
  mode: 'coop' | 'compete'
  isGameEnded: boolean
  wordLength: number
  // The starter, on every board.
  starter: { word: string; colors: string }
  // Every guess the viewer can see. Compete mid-game: only their own.
  events: GEvent[]
  // Each player, and whether they solved it, for the outcome line.
  players: { id: string; username: string; solved: boolean }[]
  myId: string
  // From the blob — the FE only holds it post-game.
  target: string | null
  // Is the answer legitimately on screen? A WIN or an explicit reveal — NOT
  // merely an ended game. A printout that spelled it out would undo the
  // hidden-on-a-loss rule from the outside (docs/ui.md → Endings).
  answerShown: boolean
  setupRows: SetupRow[]
}): PrintModel {
  const track = (who: string, guesses: GEvent[], solved: boolean): PrintTrack => {
    const solve = guesses.find((g) => g.correct)
    // A word outside the band is listed below but is no miss.
    const nMisses = guesses.filter((g) => g.verdict === 'miss').length
    // The board's rows: the starter, then the solve all green. A miss is not a
    // row, on paper as on screen.
    const boardRows: GBoardRow[] = solve ? [o.starter, { word: solve.word, colors: 'ggggg' }] : [o.starter]
    return {
      who,
      rows: [rowOf(o.starter), solve ? rowOf({ word: solve.word, colors: 'ggggg' }) : BLANK_ROW(o.wordLength)],
      keys: new Map(
        [...makeKeyColors(boardRows)].map(([letter, color]) => [letter.toUpperCase(), color]),
      ),
      turns: guesses.map((g, i) => ({
        seq: i + 1,
        who,
        text: g.word.toUpperCase(),
      })),
      result: solved
        ? `Solved, ${misses(nMisses)}`
        : o.isGameEnded
          ? 'Did not solve'
          : misses(nMisses),
    }
  }

  // Coop is ONE shared board however many players are round it, so it's one
  // track and the log names whoever made each guess. Compete is one track per
  // player — but only once the game has ended, since mid-game the viewer holds
  // nobody's guesses but their own and empty tracks would mislead.
  let tracks: PrintTrack[]
  if (o.mode === 'coop') {
    const t = track('Team', o.events, o.players.some((p) => p.solved))
    t.turns = o.events.map((g, i) => ({
      seq: i + 1,
      who: g.by.username,
      text: g.word.toUpperCase(),
    }))
    tracks = [t]
  } else if (o.isGameEnded) {
    tracks = o.players.map((p) =>
      track(
        p.id === o.myId ? `${p.username} (you)` : p.username,
        o.events.filter((g) => g.by.id === p.id),
        p.solved,
      ),
    )
  } else {
    const me = o.players.find((p) => p.id === o.myId)!
    tracks = [
      track('You', o.events.filter((g) => g.by.id === o.myId), me.solved),
    ]
  }

  return {
    brand: o.brand,
    gameTitle: o.gameTitle,
    date: o.date,
    summary:
      o.mode === 'coop'
        ? `Co-op · ${misses(o.events.filter((g) => g.verdict === 'miss').length)}`
        : `Compete · ${o.players.length} players`,
    setupRows: o.setupRows,
    mode: o.mode,
    tracks,
    // The answer is the game, and it prints under exactly the rule the screen
    // uses: won or revealed. The game having ended is NOT enough — see
    // `answerShown`.
    target: o.answerShown ? (o.target?.toUpperCase() ?? null) : null,
  }
}
