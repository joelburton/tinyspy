// cs-unmet

import type { Member } from '@/common/members/member'
import { dictBandValue } from '@/common/setup-form/dictBand'
import { makeCoopRows, makeRosterRow, makeTimerRow } from '@/common/setup-form/setupRows'
import type { SetupRow } from '@/common/setup-form/types'
import type { GSetup } from '../types'
import { AI_LEVEL_LABEL } from './setup'

/**
 * scrabble's setup rows — ONE array, rendered by the info column and the PDF
 * alike (common/setup-form/doc.md → Setup rows). Order mirrors `components/SetupForm.tsx`.
 *
 * The AI row appears only when the dialog offered it AND some were seated —
 * a control that didn't apply produces no row.
 */
export function makeSetupRows(
  setup: GSetup,
  mode: 'coop' | 'compete',
  players: Member[],
): SetupRow[] {
  const rows: SetupRow[] = [
    makeRosterRow(players),
    ...makeCoopRows(setup, mode, players),
    { key: 'dict_2', label: 'Dictionary (2-letter)', value: dictBandValue(setup.dict_2) },
    { key: 'dict_3plus', label: 'Dictionary (longer)', value: dictBandValue(setup.dict_3plus) },
  ]
  if (mode === 'coop') {
    // A coop game started before either setting has neither: no goal, and
    // free swaps.
    const goal = setup.goal_score ?? null
    rows.push({ key: 'goal_score', label: 'Point goal', value: goal === null ? 'None' : `${goal} pts` })
    rows.push({ key: 'swap_cost', label: 'Swap cost', value: `${setup.swap_cost ?? 0} pts` })
  }
  if (mode === 'compete' && setup.ai_count > 0) {
    rows.push({
      key: 'ai_count',
      label: 'AI players',
      value: `${setup.ai_count} x ${AI_LEVEL_LABEL[setup.ai_level]}`,
    })
  }
  if (mode === 'compete') {
    // `players` holds the bots too, so a bot's pick finds its name.
    const first = players.find((p) => p.id === setup.first_turn_user_id)
    rows.push({ key: 'first_turn_user_id', label: 'First player', value: first?.username ?? 'Random' })
  }
  rows.push(makeTimerRow(setup.timer))
  return rows
}
