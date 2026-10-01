// cs-unmet

import { useEffect } from 'react'
import type { Actor } from '../members/member'
import type { FeedbackSlot } from './feedbackSlotStore'
import { FeedbackMessage } from './FeedbackMessage'

type ShowWaitingMessageOptions = {
  slot: FeedbackSlot
  // The move is someone else's — the page's `isWaitingForTurn`, or a game's
  // narrowing of it.
  isWaiting: boolean
  // The player the turn pointer names; nothing when it names nobody I know.
  holder: Actor | null | undefined
}

/**
 * Show "Waiting for <holder>" in a game's local slot while the move is someone
 * else's, and retract it the moment it isn't — the turn arriving, the game
 * ending, the page unmounting. Reach for it from a turn-order game's PlayArea.
 *
 * On a phone the info column's whose-turn line is off-canvas, so this is the
 * whose-turn answer beside a board that has gone still.
 *
 * `holder` may be a fresh object on every render (a game rebuilds its players
 * on every reload); the effect keys on its name and color, so a reload with
 * the same holder leaves the message where it is.
 */
export function useShowWaitingMessage({
  slot,
  isWaiting,
  holder,
}: ShowWaitingMessageOptions): void {
  const username = holder?.username
  const color = holder?.color
  useEffect(function showWaiting() {
    if (!isWaiting) return
    const id = slot.show(
      FeedbackMessage.waiting(username === undefined ? undefined : { username, color: color ?? '' }),
    )
    return () => slot.retract(id)
  }, [slot, isWaiting, username, color])
}
