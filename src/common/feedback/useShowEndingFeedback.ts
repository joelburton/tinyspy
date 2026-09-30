// cs-unmet

import { useEffect } from 'react'
import type { TerminalMessage } from '../terminal/terminalMessage'
import type { FeedbackSlot } from './feedbackSlotStore'
import { FeedbackMessage } from './FeedbackMessage'

/**
 * Show the endings' messages in the local slot — the pill under the board —
 * for as long as each holds, and retract each when it goes (a Restart, the page
 * unmounting). Reach for it from every PlayArea, handing it the messages the
 * game builds, each null while it does not apply.
 *
 * - `gameEndingMessage`: the game has ended, and how. Shown as a
 *   `terminalVerdict`.
 * - `playerEndingMessage`: I have ended while the others play on. Shown as a
 *   `standingState`, which ranks below the verdict, so the verdict takes the
 *   pill if both are ever shown.
 *
 * Each message must keep its identity for as long as its ending does (each
 * game memoizes its own); a fresh object would retract and re-show the pill.
 */
export function useShowEndingFeedback(
  slot: FeedbackSlot,
  {
    gameEndingMessage,
    playerEndingMessage,
  }: {
    gameEndingMessage: TerminalMessage | null
    playerEndingMessage: TerminalMessage | null
  },
): void {
  useEffect(function showGameEndingFeedback() {
    if (!gameEndingMessage) return
    const id = slot.show(FeedbackMessage.terminalVerdict(gameEndingMessage))
    return () => slot.retract(id)
  }, [slot, gameEndingMessage])

  useEffect(function showPlayerEndingFeedback() {
    if (!playerEndingMessage) return
    const id = slot.show(
      FeedbackMessage.standingState(
        playerEndingMessage.outcome,
        playerEndingMessage.pillText,
      ),
    )
    return () => slot.retract(id)
  }, [slot, playerEndingMessage])
}
