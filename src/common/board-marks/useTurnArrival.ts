// cs-unmet

import { useState } from 'react'

/**
 * How many times the turn has ARRIVED — become mine — since this component
 * mounted. Each arrival bumps the count, so a consumer keys on it: the yellow
 * frame (`useTurnStartFlash`) and the bell (`sounds/useTurnBell`) mark the
 * same moment because they read the same number.
 *
 * Two rules:
 *
 *   1. **Never on mount.** Opening a game that is already your turn is not the
 *      turn arriving, so the count starts at 0 whichever way `myTurn` starts.
 *   2. **Rising edge only.** The turn leaving changes nothing here; the turn
 *      coming back is a fresh arrival.
 *
 * In a free-for-all game `myTurn` is permanently true, so the count stays 0.
 * A caller that must not mark an arrival in some state — a finished game —
 * passes `false` for it, which is a falling edge rather than an arrival.
 *
 * **`null` means "not known yet"** — a game whose own rows are still loading.
 * The first KNOWN value seeds the hook without counting, so a page that opens
 * on your turn does not announce it once its data lands; that load is rule 1's
 * mount, arriving a render late.
 */
export function useTurnArrival(myTurn: boolean | null): number {
  const [arrivals, setArrivals] = useState(0)

  // Detected during render (React's endorsed "storing information from
  // previous renders" shape, and the house rule against setState in effects).
  const [prevMyTurn, setPrevMyTurn] = useState(myTurn)
  if (myTurn !== prevMyTurn) {
    setPrevMyTurn(myTurn)
    if (myTurn === true && prevMyTurn !== null) setArrivals((n) => n + 1)
  }

  return arrivals
}
