import type { Member } from '../../common/lib/games'
import { difficultyValue } from '../../common/lib/game/difficulty'
import {
  coopRows,
  rosterRow,
  timerRow,
  type SetupRow,
} from '../../common/lib/game/setupRows'
import { PAR } from './board'
import type { LetterboxedSetup } from './setup'

/**
 * letterboxed's setup recap — ONE array, rendered by the info column and the
 * PDF alike (docs/pdf.md → Setup rows).
 *
 * The order mirrors `components/SetupForm.tsx` exactly, because the recap is
 * that dialog read back: roster (the dialog's own player picker, above the
 * per-game body), co-op pacing, word limit, dictionary, timer.
 *
 * The word limit is quoted against PAR the same way the form asks for it — "5
 * words" alone doesn't say how much room that is, while "par + 3" says exactly
 * how much slack you gave yourselves, and par here is the constant 2.
 */
export function setupRows(
  setup: LetterboxedSetup,
  mode: 'coop' | 'compete',
  players: Member[],
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
    timerRow(setup.timer),
  ]
}
