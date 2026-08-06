import type { Member } from '../../common/lib/games'
import { difficultyValue } from '../../common/lib/game/difficulty'
import { coopRows, rosterRow, timerRow, type SetupRow } from '../../common/lib/game/setupRows'
import type { WordleSetup } from './setup'

/** Where the hidden target is drawn from. `0` = the curated NYT-Wordle answer
 *  list; `1..6` = a clean word of that difficulty band or easier. */
function answerSourceLabel(n: number): string {
  return n === 0 ? 'NYT Wordle list' : `${difficultyValue(n)} or easier`
}

/**
 * wordle's setup recap — ONE array, rendered by the info column and the PDF
 * alike (docs/pdf.md → Setup rows). Order mirrors `components/SetupForm.tsx`.
 */
export function setupRows(
  setup: WordleSetup,
  mode: 'coop' | 'compete',
  players: Member[],
): SetupRow[] {
  return [
    rosterRow(players),
    ...coopRows(setup, mode, players),
    { key: 'max_guesses', label: 'Guesses', value: String(setup.max_guesses) },
    { key: 'answer_source', label: 'Answer', value: answerSourceLabel(setup.answer_source) },
    { key: 'legal_guess', label: 'Dictionary', value: difficultyValue(setup.legal_guess) },
    timerRow(setup.timer),
  ]
}
