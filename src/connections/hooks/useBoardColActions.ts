// cs-unmet

import { useBindAction, type Action } from '@/common/actions/useBindAction'
import type { GPicks } from '../types'

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
  isInteractive,
  picks,
  submitGuess,
}: {
  // The board is mine to touch right now: my move, on the live board.
  isInteractive: boolean
  picks: GPicks
  submitGuess: () => Promise<void>
}): {
  actSubmit: Action
  actClearPicks: Action
} {
  const actSubmit = useBindAction('act-submit', {
    describe: () => {
      if (!isInteractive) return 'hidden'
      return picks.isComplete ? 'active' : 'disabled'
    },
    run: submitGuess,
  })

  const actClearPicks = useBindAction('act-clear-picks', {
    describe: () => {
      if (!isInteractive) return 'hidden'
      return picks.union.length === 0 ? 'disabled' : 'active'
    },
    run: picks.sendClear,
  })

  return { actSubmit, actClearPicks }
}
