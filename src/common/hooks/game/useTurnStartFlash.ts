import { useEffect, useState } from 'react'
import { YOUR_TURN_FLASH_MS } from '../../lib/game/feedbackTiming'

/**
 * True for a beat at the moment the turn becomes MINE — drives the shared
 * `.yourTurnFlash` frame (common/components/game/PlayArea.module.css).
 *
 * The problem it solves: in a turn-order game the board looks exactly the same
 * the instant it becomes yours, and you are by definition looking somewhere else
 * when it happens (you have been waiting). The dim lifting is a real signal, but
 * a *removal* is a poor one — you notice things that appear far better than
 * things that stop.
 *
 * Two rules, both mirroring `useCelebration`'s:
 *
 *   1. **Never on mount.** Opening a game that is already your turn is not the
 *      turn arriving; `prev` seeds from the first value, so only a genuine
 *      false → true transition during the session fires.
 *   2. **Rising edge only.** Losing the turn is announced by the board dimming,
 *      which is a state, not an event.
 *
 * In a free-for-all game `myTurn` is permanently true, so this never fires —
 * no caller-side gate needed.
 *
 * The transition is detected DURING render (React's endorsed "storing
 * information from previous renders" shape, and the house rule against setState
 * in effects); only the self-clearing timer is an effect, which is fine — it
 * fires asynchronously rather than cascading a render.
 */
export function useTurnStartFlash(myTurn: boolean): boolean {
  const [flashing, setFlashing] = useState(false)

  const [prevMyTurn, setPrevMyTurn] = useState(myTurn)
  if (myTurn !== prevMyTurn) {
    setPrevMyTurn(myTurn)
    setFlashing(myTurn)
  }

  useEffect(() => {
    if (!flashing) return
    const timer = setTimeout(() => setFlashing(false), YOUR_TURN_FLASH_MS)
    return () => clearTimeout(timer)
  }, [flashing])

  return flashing
}
