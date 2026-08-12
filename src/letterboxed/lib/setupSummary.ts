import type { Member } from '../../common/lib/games'
import { difficultyValue } from '../../common/lib/game/difficulty'
import {
  BOARD_KEY,
  coopRows,
  rosterRow,
  timerRow,
  type SetupRow,
} from '../../common/lib/game/setupRows'
import { PAR } from './board'
import { formatSides } from './customBoard'
import type { LetterboxedSetup } from './setup'

/**
 * letterboxed's setup recap — ONE array, rendered by the info column and the
 * PDF alike (docs/pdf.md → Setup rows).
 *
 * The order mirrors `components/SetupForm.tsx` exactly, because the recap is
 * that dialog read back: roster (the dialog's own player picker, above the
 * per-game body), co-op pacing, word limit, dictionary, timer.
 *
 * The board row keeps that order rather than breaking it: it sits directly
 * above the timer, which is exactly where the dialog puts its own "Board
 * (optional)" section. So the recap is still the form read back, top to bottom.
 *
 * What it DOES take is the board-identity exception the three other
 * board-from-letters games take (setupRows.ts → BOARD_KEY): it prints for
 * ROLLED boards too, where there was no dialog input to read back. Two reasons,
 * both that file's. The dialog can TAKE a board as input, so the row is the
 * round trip — read a board you liked off the recap or the printout, paste it
 * into the next game's dialog, hand a friend the same puzzle. And like the
 * roster, it says WHICH board this was, which no other row can. A row that
 * appeared only on hand-typed boards would be exactly the wrong half, since the
 * board worth re-sharing is usually one the game chose.
 *
 * The roster still leads, as it does in every game's recap
 * (`src/setupRows.test.ts` pins that for all of them).
 *
 * `sides` is a parameter rather than something read out of `setup` because it
 * lives on the game row — a rolled board never touches the setup blob at all.
 *
 * The word limit is quoted against PAR the same way the form asks for it — "5
 * words" alone doesn't say how much room that is, while "par + 3" says exactly
 * how much slack you gave yourselves, and par here is the constant 2.
 */
export function setupRows(
  setup: LetterboxedSetup,
  mode: 'coop' | 'compete',
  players: Member[],
  sides: string,
): SetupRow[] {
  return [
    rosterRow(players),
    ...coopRows(setup, mode, players),
    {
      key: 'extra_words',
      label: 'Word limit',
      value: `par + ${setup.extra_words} (${PAR + setup.extra_words} words)`,
    },
    { key: 'legal_band', label: 'Dictionary', value: difficultyValue(setup.legal_band) },
    // Directly above the timer, which is where the dialog's own "Board
    // (optional)" section sits — so the recap stays the form read back, in the
    // form's order. Labelled "Board" rather than the letter games' "Letters":
    // twelve letters in side order IS the puzzle here, not the pool a puzzle
    // was built from.
    { key: BOARD_KEY, label: 'Board', value: formatSides(sides) },
    timerRow(setup.timer),
  ]
}
