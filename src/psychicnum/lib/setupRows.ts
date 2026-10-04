// cs-blessed-psychicnum

import type { Member } from '@/common/members/member'
import { difficultyValue } from '@/common/setup-form/difficulty'
import { makeCoopRows, makeRosterRow, makeTimerRow } from '@/common/setup-form/setupRows'
import type { SetupRow } from '@/common/setup-form/types'
import type { GSetup } from '../types'

/**
 * psychicnum's setup rows — ONE array, rendered by the info column and the PDF
 * alike (common/setup-form/doc.md → Setup rows).
 *
 * Order mirrors `components/SetupForm.tsx`: roster (the dialog's own player
 * picker, above the per-game body), co-op pacing, guesses, words on board,
 * dictionary, timer.
 */
export function makeSetupRows(
  setup: GSetup,
  mode: 'coop' | 'compete',
  players: Member[],
): SetupRow[] {
  return [
    makeRosterRow(players),
    ...makeCoopRows(setup, mode, players),
    { key: 'max_guesses', label: 'Guesses', value: String(setup.max_guesses) },
    { key: 'word_count', label: 'Words on board', value: String(setup.word_count) },
    { key: 'band', label: 'Dictionary', value: difficultyValue(setup.band) },
    makeTimerRow(setup.timer),
  ]
}
