// cs-unmet

import { useEffect } from 'react'
import type { Player } from '../members/member'
import type { FeedbackSlot } from './feedbackSlotStore'
import { FeedbackMessage } from './FeedbackMessage'

type ShowWaitingMessageOptions = {
  slot: FeedbackSlot
  // The move is someone else's — the page's `isWaitingForTurn`, or a game's
  // narrowing of it.
  isWaiting: boolean
  // Who holds the turn (`gd.turns.holder`); null in a game with no turn order,
  // which is never waiting.
  holder: Player | null
}

/**
 * Show "Waiting for <holder>" in a game's local slot while the move is someone
 * else's, and retract it the moment it isn't — the turn arriving, the game
 * ending, the page unmounting. Reach for it from a turn-order game's PlayArea.
 *
 * On a phone the info column's whose-turn line is off-canvas, so this is the
 * whose-turn answer beside a board that has gone still.
 *
 * `holder` is a fresh object on every reload of the blob; the effect keys on
 * its fields, so a reload with the same holder leaves the message where it is.
 */
export function useShowWaitingMessage({
  slot,
  isWaiting,
  holder,
}: ShowWaitingMessageOptions): void {
  const id = holder?.id
  const username = holder?.username
  const color = holder?.color
  useEffect(function showWaiting() {
    if (!isWaiting) return
    // Waiting is a turn game's state, and a turn game always has a holder.
    const shown = slot.show(FeedbackMessage.waiting({ id: id!, username: username!, color: color! }))
    return () => slot.retract(shown)
  }, [slot, isWaiting, id, username, color])
}
