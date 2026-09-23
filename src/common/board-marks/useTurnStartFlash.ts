// cs-blessed-board-marks

import { useEffect, useState } from 'react'
import { YOUR_TURN_FLASH_MS } from './feedbackTiming'
import { useTurnArrival } from './useTurnArrival'

/**
 * True for a beat at the moment the turn becomes MINE — drives the shared
 * `.yourTurnFlash` frame (common/game-page/playArea.module.css).
 *
 * The moment is `useTurnArrival`'s — never on mount, rising edge only — which
 * the turn bell reads too, so the frame and the sound mark the same arrival.
 * Losing the turn is announced by the board dimming, a state rather than an
 * event, but it does take a frame still up OFF at once: you acted, so the
 * announcement is spent. The turn coming back is a fresh arrival on a full
 * clock.
 *
 * Why the turn arriving needs a mark of its own: common/board-marks/doc.md.
 */
export function useTurnStartFlash(myTurn: boolean): boolean {
  const arrivals = useTurnArrival(myTurn)

  // The arrival whose beat has run out. The frame is up while it is my turn and
  // the latest arrival is newer than that.
  const [spent, setSpent] = useState(0)

  useEffect(function takeFrameOffAfterBeat() {
    if (arrivals === 0) return
    const timer = setTimeout(() => setSpent(arrivals), YOUR_TURN_FLASH_MS)
    return () => clearTimeout(timer)
  }, [arrivals])

  return myTurn && arrivals > spent
}
