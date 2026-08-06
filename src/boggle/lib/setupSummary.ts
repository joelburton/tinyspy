import type { Member } from '../../common/lib/games'
import { difficultyValue } from '../../common/lib/game/difficulty'
import { rosterRow, timerRow, type SetupRow } from '../../common/lib/game/setupRows'
import { DICE_BY_NAME } from './dice'
import type { BoggleSetup } from './setup'

/**
 * boggle's setup recap — ONE array, rendered by the info column and the PDF
 * alike (docs/pdf.md → Setup rows). Order mirrors `components/SetupForm.tsx`.
 *
 * The labels used to differ between the two consumers ("Board" vs "Dice",
 * "Min word length" vs "Min length", "Dictionary (required)" vs "Required
 * words") — one fact named twice by two files. These are the screen's, since
 * that's the wording players actually learned.
 */
export function setupRows(
  setup: BoggleSetup,
  _mode: 'coop' | 'compete',
  players: Member[],
): SetupRow[] {
  // Derived here rather than taken as an argument: it's a pure function of a
  // setup KEY, and the component computed it too late in its render to hand over.
  const ladderLabel =
    setup.scoring_ladder.charAt(0).toUpperCase() + setup.scoring_ladder.slice(1)
  return [
    rosterRow(players),
    {
      key: 'dice_set',
      label: 'Board',
      value: DICE_BY_NAME[setup.dice_set]?.desc ?? setup.dice_set,
    },
    { key: 'band', label: 'Dictionary (required)', value: difficultyValue(setup.band) },
    { key: 'legal_band', label: 'Dictionary (legal)', value: difficultyValue(setup.legal_band) },
    { key: 'scoring_ladder', label: 'Scoring', value: ladderLabel },
    { key: 'min_word_length', label: 'Min word length', value: String(setup.min_word_length) },
    {
      key: 'win_percent',
      label: 'Win at',
      // `== null` catches undefined too: the old screen row tested `=== null`
      // only, so an unset threshold rendered "undefined%" — invisible on screen
      // behind a closed disclosure, glaring once it printed.
      value: setup.win_percent == null ? 'none' : `${setup.win_percent}%`,
    },
    timerRow(setup.timer),
  ]
}
