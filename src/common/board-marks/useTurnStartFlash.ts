// cs-audited-board-marks

import { useEffect, useState } from 'react'
import { YOUR_TURN_FLASH_MS } from './feedbackTiming'

/**
 * True for a beat at the moment the turn becomes MINE — drives the shared
 * `.yourTurnFlash` frame (common/game-page/playArea.module.css).
 *
 * Two rules, the same never-on-mount and rising-edge pair `useCelebration`
 * runs on:
 *
 *   1. **Never on mount.** Opening a game that is already your turn is not the
 *      turn arriving; `prevMyTurn` seeds from the first value, so only a genuine
 *      false → true transition during the session fires.
 *   2. **Rising edge only.** Losing the turn is announced by the board dimming,
 *      which is a state, not an event. It does take a frame still up OFF at
 *      once — you acted, so the announcement is spent — and the turn coming
 *      back is a fresh arrival on a full clock.
 *
 * In a free-for-all game `myTurn` is permanently true, so this never fires —
 * no caller-side gate needed.
 *
 * Why the turn arriving needs a mark of its own: common/board-marks/doc.md.
 */
export function useTurnStartFlash(myTurn: boolean): boolean {
  const [flashing, setFlashing] = useState(false)

  // Detected during render (React's endorsed "storing information from previous
  // renders" shape, and the house rule against setState in effects); only the
  // self-clearing timer below is an effect, which is fine — it fires
  // asynchronously rather than cascading a render.
  const [prevMyTurn, setPrevMyTurn] = useState(myTurn)
  if (myTurn !== prevMyTurn) {
    setPrevMyTurn(myTurn)
    setFlashing(myTurn)
  }

  useEffect(function takeFrameOffAfterBeat() {
    if (!flashing) return
    const timer = setTimeout(() => setFlashing(false), YOUR_TURN_FLASH_MS)
    return () => clearTimeout(timer)
  }, [flashing])

  return flashing
}
