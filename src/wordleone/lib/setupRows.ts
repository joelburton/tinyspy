// cs-unmet

import type { Member } from '@/common/members/member'
import {
  makeCoopRows,
  makeRosterRow,
  makeTimerRow,
} from '@/common/setup-form/setupRows'
import type { SetupRow } from '@/common/setup-form/types'
import { answerBandValue, DIFFICULTY_OPTIONS } from './setup'
import type { GSetup } from '../types'

/**
 * wordleone's setup rows — ONE array, rendered by the info column and the PDF
 * alike (common/setup-form/doc.md → Setup rows). Order mirrors
 * `components/SetupForm.tsx`.
 */
export function makeSetupRows(
  setup: GSetup,
  mode: 'coop' | 'compete',
  players: Member[],
): SetupRow[] {
  return [
    makeRosterRow(players),
    ...makeCoopRows(setup, mode, players),
    {
      key: 'answer_band',
      label: 'Answer',
      value: answerBandValue(setup.answer_band),
    },
    {
      key: 'difficulty',
      label: 'Difficulty',
      value: DIFFICULTY_OPTIONS.find(
        (o) => o.value === setup.difficulty)!.label,
    },
    makeTimerRow(setup.timer),
  ]
}
