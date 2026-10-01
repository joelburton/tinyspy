// cs-unmet

import { useBindAction, type Action } from '@/common/actions/useBindAction'
import { TILES_PER_CATEGORY } from '../lib/board'

/**
 * The board column's two commands, on their buttons and their keys: Submit
 * (Enter) sends the four picked tiles, and Clear (⌫) drops the picks — and
 * BROADCASTS the drop, so a teammate's board drops them too. Both are hidden,
 * not merely inert, where the board is not this player's to touch (a past turn
 * open, a teammate's move), so they do not swallow a key another binding
 * wanted. Fewer than four picks leaves Submit gray rather than firing a no-op.
 * The board's own Shuffle is bound with the board (`useTileShuffle`).
 *
 * One guess is out at a time: Submit's run waits for `submitGuess`, and an
 * action neither runs nor draws live while its run is out (`useBindAction`'s
 * `pending`).
 */
export function useBoardColActions({
  canPick,
  canSubmit,
  unionTiles,
  submitGuess,
  sendClear,
}: {
  // A pick can be made or cleared right now.
  canPick: boolean
  // It is my move, and a guess can go.
  canSubmit: boolean
  // Every held tile — what Submit sends.
  unionTiles: readonly string[]
  submitGuess: () => Promise<void>
  sendClear: () => void
}): {
  actSubmit: Action
  actClearPicks: Action
} {
  const actSubmit = useBindAction('act-submit', {
    describe: () => {
      if (!canSubmit) return 'hidden'
      return unionTiles.length === TILES_PER_CATEGORY ? 'active' : 'disabled'
    },
    run: submitGuess,
  })

  const actClearPicks = useBindAction('act-clear-picks', {
    describe: () => {
      if (!canPick) return 'hidden'
      return unionTiles.length === 0 ? 'disabled' : 'active'
    },
    run: sendClear,
  })

  return { actSubmit, actClearPicks }
}
