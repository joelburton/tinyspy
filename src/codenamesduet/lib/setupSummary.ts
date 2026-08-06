import type { Member } from '../../common/lib/games'
import { rosterRow, timerRow, type SetupRow } from '../../common/lib/game/setupRows'
import type { CodenamesduetSetup } from './setup'

/**
 * codenamesduet's setup recap — ONE array, rendered by the info column and the
 * PDF alike (docs/pdf.md → Setup rows). Order mirrors
 * `components/SetupForm.tsx`.
 *
 * The first-clue SEAT is a control (the dialog picks who opens), so it earns a
 * row — resolved to a username here rather than printing a uuid.
 */
export function setupRows(
  setup: CodenamesduetSetup,
  _mode: 'coop' | 'compete',
  players: Member[],
): SetupRow[] {
  const first = players.find((p) => p.user_id === setup.first_clue_giver_user_id)
  return [
    rosterRow(players),
    { key: 'turns', label: 'Turns', value: String(setup.turns) },
    { key: 'first_clue_giver_user_id', label: 'First clue', value: first?.username ?? '—' },
    timerRow(setup.timer),
  ]
}
