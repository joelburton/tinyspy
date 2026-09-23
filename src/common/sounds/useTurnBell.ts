// cs-unmet

import { useEffect } from 'react'
import { useTurnArrival } from '../board-marks/useTurnArrival'
import { playSound, preloadSound } from './playSound'

/**
 * Ring the bell the moment the turn becomes mine — the same arrival the yellow
 * `useTurnStartFlash` frame marks, read from the same `useTurnArrival` count,
 * so the two land together. Never on mount, never when the turn leaves.
 *
 * `GamePage` calls this once with the common turn pointer, which rings for
 * every game that moves `common.games.current_turn_user_id`. A game whose turn
 * is its own calls it with its own value — `null` while that value is still
 * loading, so the load itself does not ring. Pass `false` whenever an arrival
 * must not ring — a finished game — since that is a falling edge, not an
 * arrival.
 *
 * Whether it sounds at all is `playSound`'s to decide, from the player's
 * "Enable sounds" setting. The file is fetched on mount, so the first ring is
 * not late.
 */
export function useTurnBell(myTurn: boolean | null): void {
  const arrivals = useTurnArrival(myTurn)

  useEffect(function preloadBell() {
    preloadSound('bell')
  }, [])

  useEffect(function ringOnArrival() {
    if (arrivals === 0) return
    playSound('bell')
  }, [arrivals])
}
