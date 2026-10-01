// cs-blessed-wordle

import type { PrintHeader , SetupRow } from '@/common/pdf/frame'
import type { TurnRow } from '@/common/pdf/eventLog'
import { getTileColor, type TileColor } from '@/shared/wordle-style/tileColor'
import { makeKeyColors } from '../lib/colors'
import { memberById } from '@/common/members/memberList'
import type { EventRow } from '../hooks/useGame'

/**
 * Build the wordle print model — the pure half, away from jsPDF so the judgment
 * is testable without a renderer.
 *
 * Two judgments live here. **The target is a secret**: it's on the game row and
 * the FE holds it, but it must not print before the game ends any more than it
 * shows on screen. And **the keyboard is derived, not stored** — the best state
 * seen for each letter across that player's guesses — so it has to be
 * recomputed per player rather than shared, which is easy to get wrong once
 * compete prints everyone's board.
 */

/** One board row: five tiles, or five blanks for a row not yet played. */
export type PrintRow = { letters: string[]; states: TileColor[] }

/** One player's page-column: their board, their keyboard, their guesses. */
export type PrintTrack = {
  who: string
  rows: PrintRow[]
  // letter → best state seen. Absent letters are untried ('blank').
  keys: Map<string, TileColor>
  turns: TurnRow[]
  // Their own outcome line ("solved in 4" / "did not solve").
  result: string
}

export type WordlePrintModel = PrintHeader & {
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

/** A guess row → its tiles. `colors` is the server's per-letter g/y/x
 *  string. */
function rowOf(g: EventRow): PrintRow {
  return {
    letters: [...g.word.toUpperCase()],
    states: [...g.word].map((_, i) => getTileColor(g.colors[i])),
  }
}

/**
 * The keyboard, from the on-screen keyboard's own `makeKeyColors` — so paper
 * and screen can't disagree about whether a letter is "still possible". The
 * page prints letters upper-case. Letters never tried are simply absent, which
 * the renderer draws as the blank (borderless) state.
 */
function keysOf(guesses: readonly EventRow[]): Map<string, TileColor> {
  const keyColors = makeKeyColors(guesses.map((g) => ({ guess: g.word, colors: g.colors })))
  return new Map([...keyColors].map(([letter, color]) => [letter.toUpperCase(), color]))
}

export function buildWordlePrintModel(o: {
  brand: string
  gameTitle: string
  date: string
  mode: 'coop' | 'compete'
  isGameEnded: boolean
  maxGuesses: number
  wordLength: number
  // Every guess the viewer can see. Compete mid-game: only their own.
  guesses: EventRow[]
  players: { user_id: string; username: string }[]
  myId: string
  // From the game row — the FE only holds it post-game.
  target: string | null
  // Is the answer legitimately on screen? A WIN or an explicit reveal — NOT
  // merely an ended game. wordle hides the answer on a loss so a Restart is a
  // real second try (docs/ui.md → Terminal results), and a printout that
  // spelled it out would undo that from the outside.
  answerShown: boolean
  // Per-player solved flags, for the outcome line.
  solvedBy: ReadonlySet<string>
  setupRows: SetupRow[]
}): WordlePrintModel {
  const nameOf = (id: string) => memberById(o.players, id)?.username ?? 'someone'

  const track = (who: string, guesses: EventRow[], solved: boolean): PrintTrack => {
    const played = guesses.map(rowOf)
    return {
      who,
      // Always the full board height — the unplayed rows print as blanks, so a
      // 3-guess win and a 6-guess grind occupy the same shape and can be
      // compared at a glance across columns.
      rows: [
        ...played,
        ...Array.from({ length: Math.max(0, o.maxGuesses - played.length) }, () =>
          BLANK_ROW(o.wordLength),
        ),
      ],
      keys: keysOf(guesses),
      turns: guesses.map((g, i) => ({
        seq: i + 1,
        who,
        // Plain words, no tile treatment — the board above already carries the
        // colors, and repeating them in the log would be noise.
        text: g.word.toUpperCase(),
      })),
      result: solved
        ? `Solved in ${guesses.length}`
        : o.isGameEnded
          ? 'Did not solve'
          : `${guesses.length}/${o.maxGuesses} guesses`,
    }
  }

  // Coop is ONE shared board however many players are round it, so it's one
  // track and the log names whoever made each guess. Compete is one track per
  // player — but only once the game has ended, since mid-game RLS means the
  // viewer holds nobody's guesses but their own and empty tracks would mislead.
  let tracks: PrintTrack[]
  if (o.mode === 'coop') {
    const t = track('Team', o.guesses, o.solvedBy.size > 0)
    t.turns = o.guesses.map((g, i) => ({
      seq: i + 1,
      who: nameOf(g.user_id),
      text: g.word.toUpperCase(),
    }))
    tracks = [t]
  } else if (o.isGameEnded) {
    tracks = o.players.map((p) =>
      track(
        p.user_id === o.myId ? `${p.username} (you)` : p.username,
        o.guesses.filter((g) => g.user_id === p.user_id),
        o.solvedBy.has(p.user_id),
      ),
    )
  } else {
    tracks = [
      track('You', o.guesses.filter((g) => g.user_id === o.myId), o.solvedBy.has(o.myId)),
    ]
  }

  return {
    brand: o.brand,
    gameTitle: o.gameTitle,
    date: o.date,
    summary:
      o.mode === 'coop'
        ? `Co-op · ${o.guesses.length}/${o.maxGuesses} guesses`
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
