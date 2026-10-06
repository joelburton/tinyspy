// cs-unmet

import { useBindAction, type Action } from '@/common/actions/useBindAction'
import type { FeedbackSlot } from '@/common/feedback/feedbackSlotStore'
import { FeedbackMessage } from '@/common/feedback/FeedbackMessage'
import { answerMessage } from '../lib/answer'
import { slotForKey } from '../lib/letters'
import { CLAIM_SIZE, toggleTile } from '../lib/picks'
import { hintLabel } from '../lib/readouts'
import { isSet } from '../lib/tiles'
import type { GGameData, GTile } from '../types'

/**
 * The board column's commands: a letter picks the tile in its slot, ⌫ drops
 * the picks, and Hint takes the next rung of the hint ladder. Hands back
 * `canPick` — the gate every pick asks — `pickTile`, which a click and a
 * letter both land on, and the Hint action, which the phone's status bar
 * places (the info column shows the same one, `useAction('act-hint')`).
 *
 * A pick toggles: a second click or letter un-picks. The third pick completes
 * a claim, and the frontend can judge it — the whole table is face-up — so a
 * non-set is refused here instead of round-tripping to be told the same
 * thing. The picks clear either way: a refused pick is not a state worth
 * keeping around to correct.
 */
export function useBoardColActions({
  gd,
  isInteractive,
  picks,
  inFlightTileIds,
  submitClaim,
  spendHint,
  localFeedbackSlot,
}: {
  gd: GGameData
  // My move, on the live table.
  isInteractive: boolean
  picks: { tileIds: readonly string[]; set: (tileIds: readonly string[]) => void; clear: () => void }
  // A claim's three tiles on their way: they take no pick.
  inFlightTileIds: ReadonlySet<string>
  submitClaim: (tiles: readonly GTile[]) => Promise<void>
  spendHint: () => Promise<void>
  // Where "Not a set" says so.
  localFeedbackSlot: FeedbackSlot
}): {
  canPick: boolean
  pickTile: (tile: GTile) => void
  actHint: Action
} {
  // Not gated on a claim being in flight: the rest of the table stays live so
  // a fast player can start their next set while this one travels.
  const canPick = isInteractive

  function pickTile(tile: GTile) {
    if (!canPick || inFlightTileIds.has(tile.id)) return
    // A pick is the next move, like a keystroke.
    localFeedbackSlot.dismiss()
    const next = toggleTile(picks.tileIds, tile)
    if (next.length < CLAIM_SIZE) {
      picks.set(next)
      return
    }
    picks.clear()
    // Every pick is on the table: `picks.tileIds` is the live picks.
    const [a, b, c] = next.map((id) => gd.board.tilesById[id]!) as [GTile, GTile, GTile]
    if (isSet(a, b, c)) {
      void submitClaim([a, b, c])
    } else {
      const { outcome, text } = answerMessage({ answerType: 'not_a_set' })
      localFeedbackSlot.show(FeedbackMessage.result(outcome, text))
    }
  }

  // A letter under each tile, bound to the SLOT. A pattern action, handed
  // whichever letter fired it, which is what makes twenty-one tiles one action
  // rather than twenty-one. Hidden while a past turn is open: a live key over a
  // frozen table would be lying about what it can do.
  useBindAction('act-pick-by-letter', {
    describe: () => (canPick ? 'active' : 'hidden'),
    run: (key) => {
      // An empty slot's letter does nothing — there is no tile there yet.
      const tile = gd.board.tiles[slotForKey(key ?? '')]
      if (tile !== undefined) pickTile(tile)
    },
  })

  useBindAction('act-clear-picks', {
    describe: () => (canPick ? 'active' : 'hidden'),
    run: () => {
      picks.clear()
      localFeedbackSlot.dismiss()
    },
  })

  // Hint — on the surface in compete too, disabled and saying why: hiding it
  // would leave a player hunting for a button they know this game has. (The
  // ban itself is the priced-hint rule: a free generative hint decides a
  // race.) The run's single flight is what stops a fast second press running
  // a second ladder against the ring and table of the first.
  const actHint = useBindAction('act-hint', {
    describe: () => ({
      state: gd.compete || !gd.me.onTurn ? 'disabled' : 'active',
      label: hintLabel(gd.compete),
    }),
    run: spendHint,
  })

  return { canPick, pickTile, actHint }
}
