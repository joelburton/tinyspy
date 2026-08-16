import type { Member } from '../../common/lib/games'
import { coopRows, rosterRow, timerRow, type SetupRow } from '../../common/lib/game/setupRows'
import { paletteOf, type SetgameSetup } from './setup'

/**
 * setgame's setup recap — ONE array, rendered by the info column and the PDF
 * alike (docs/pdf.md → Setup rows). Order mirrors `components/SetupForm.tsx`.
 */
export function setupRows(
  setup: SetgameSetup,
  mode: 'coop' | 'compete',
  players: Member[],
): SetupRow[] {
  return [
    rosterRow(players),
    ...coopRows(setup, mode, players),
    {
      key: 'deck',
      label: 'Deck',
      value: setup.deck === 'junior' ? 'Junior (27 cards, all solid)' : 'Full (81 cards)',
    },
    {
      key: 'palette',
      label: 'Colors',
      value: paletteOf(setup) === 'colorblind'
        ? 'Colorblind-safe (blue / orange / magenta)'
        : 'Traditional (red / green / purple)',
    },
    timerRow(setup.timer),
  ]
}
