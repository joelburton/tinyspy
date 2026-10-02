// cs-unmet

import { useBindAction, type Action } from '@/common/actions/useBindAction'
import type { TileWord } from '../lib/tileResults'

/**
 * The board column's two commands, on their buttons and their keys: Submit
 * (Enter) guesses the picked word, and Clear (⌫) un-picks it. Both act on the
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
  canSubmit,
  choosePickedTile,
  clearPickedTile,
  submitGuess,
}: {
  pickedTile: TileWord | null
  // A pick can be made or cleared right now.
  canPick: boolean
  // It is my move, and a guess can go.
  canSubmit: boolean
  choosePickedTile: (word: TileWord | null) => void
  // Un-pick without dismissing the slot's result (see `usePickedTile`).
  clearPickedTile: () => void
  submitGuess: (word: TileWord) => Promise<void>
}): {
  actSubmit: Action
  actClearPicks: Action
} {
  const actSubmit = useBindAction('act-submit', {
    describe: () => (canSubmit && pickedTile !== null ? 'active' : 'disabled'),
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
