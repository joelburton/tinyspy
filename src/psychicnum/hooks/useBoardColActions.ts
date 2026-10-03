// cs-unmet

import { useBindAction, type Action } from '@/common/actions/useBindAction'
import type { GTile } from '../types'

/**
 * The board column's two commands, on their buttons and their keys: Submit
 * (Enter) guesses the picked tile, and Clear (⌫) un-picks it. Both act on the
 * pick whether or not the keyboard cursor shows, since the pick is always
 * drawn. The board's own Shuffle is bound with the board (`useTileShuffle`).
 *
 * One guess is out at a time: Submit's run waits for `submitGuess`, and an
 * action neither runs nor draws live while its run is out
 * (`useBindAction`'s `pending`).
 */
export function useBoardColActions({
  pickedTile,
  canPick,
  choosePickedTile,
  clearPickedTile,
  submitGuess,
}: {
  pickedTile: GTile | null
  // The board takes picks right now; Submit adds the pick itself.
  canPick: boolean
  choosePickedTile: (tile: GTile | null) => void
  clearPickedTile: () => void
  submitGuess: (tile: GTile) => Promise<void>
}): {
  actSubmit: Action
  actClearPicks: Action
} {

  const actSubmit = useBindAction('act-submit', {
    describe: () => (canPick && pickedTile !== null ? 'active' : 'disabled'),
    run: async () => {
      if (pickedTile === null) return
      clearPickedTile()
      await submitGuess(pickedTile)
    },
  })

  const actClearPicks = useBindAction('act-clear-picks', {
    describe: () => (canPick && pickedTile !== null ? 'active' : 'disabled'),
    run: () => choosePickedTile(null),
  })

  return { actSubmit, actClearPicks }
}
