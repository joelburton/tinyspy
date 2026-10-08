// cs-blessed-codenamesduet

import type { Member } from '@/common/members/member'
import { makeRosterRow, makeTimerRow } from '@/common/setup-form/setupRows'
import type { SetupRow } from '@/common/setup-form/types'
import type { GSetup } from '../types'
import { listWordPoolLabels } from './setup'

/**
 * codenamesduet's setup rows — ONE array, rendered by the info column and the
 * PDF alike (common/setup-form/doc.md → Setup rows). Order mirrors
 * `components/SetupForm.tsx`.
 *
 * The first-clue SEAT is a control (the dialog picks who opens), so it earns a
 * row — resolved to a username here rather than printing a uuid.
 */
export function makeSetupRows(
  setup: GSetup,
  _mode: 'coop' | 'compete',
  players: Member[],
): SetupRow[] {
  const first = players.find((p) => p.id === setup.first_clue_giver_user_id)
  return [
    makeRosterRow(players),
    { key: 'turns', label: 'Turns', value: String(setup.turns) },
    {
      key: 'first_clue_giver_user_id',
      label: 'First clue',
      value: first?.username ?? '—',
    },
    { key: 'word_pools', label: 'Word pool', value: listWordPoolLabels(setup.word_pools) },
    makeTimerRow(setup.timer),
  ]
}
