// cs-blessed-psychicnum

import type { Member } from '@/common/members/member'
import { difficultyValue } from '@/common/setup-form/difficulty'
import {
  coopRows,
  rosterRow,
  timerRow,
  type SetupRow,
} from '@/common/setup-form/setupRows'
import type { PsychicnumSetup } from './setup'

/**
 * psychicnum's setup recap — ONE array, rendered by the info column and the PDF
 * alike (common/setup-form/doc.md → Setup rows).
 *
 * Order mirrors `components/SetupForm.tsx`: roster (the dialog's own player
 * picker, above the per-game body), co-op pacing, guesses, words on board,
 * dictionary, timer.
 */
export function setupRows(
  setup: PsychicnumSetup,
  mode: 'coop' | 'compete',
  players: Member[],
): SetupRow[] {
  return [
    rosterRow(players),
    ...coopRows(setup, mode, players),
    { key: 'guesses', label: 'Guesses', value: String(setup.guesses) },
    { key: 'word_count', label: 'Words on board', value: String(setup.word_count) },
    { key: 'difficulty', label: 'Dictionary', value: difficultyValue(setup.difficulty) },
    timerRow(setup.timer),
  ]
}
