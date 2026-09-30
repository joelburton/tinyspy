// cs-unmet

import { useState } from 'react'

/**
 * The board row from which rows flip: a row that LANDS while you are watching
 * turns its tiles over, while the rows already there when the board mounted —
 * a mid-game refresh, an opponent's history — draw in their final color.
 *
 * It starts at the live row count at mount. The live rows only grow, and a
 * Restart remounts the whole surface (GamePage keys it on `restarts`), so a
 * replayed game starts at zero.
 *
 * Opening a past turn draws its rows in place of the live ones, so coming back
 * mounts the live rows fresh — and each would flip again. So the line moves up
 * to the live rows as they stand the moment a past turn opens, and coming back
 * flips only a row that landed while you were away. The previous render's
 * `isViewingHistory` is held in state and compared, React's pattern for
 * adjusting state to a prop change, which holds under StrictMode's double
 * render.
 */
export function useFlipBaseline(liveRowCount: number, isViewingHistory: boolean): number {
  const [flipBaseline, setFlipBaseline] = useState(liveRowCount)
  const [wasViewingHistory, setWasViewingHistory] = useState(isViewingHistory)
  if (isViewingHistory !== wasViewingHistory) {
    setWasViewingHistory(isViewingHistory)
    if (isViewingHistory) setFlipBaseline(liveRowCount)
  }
  return flipBaseline
}
