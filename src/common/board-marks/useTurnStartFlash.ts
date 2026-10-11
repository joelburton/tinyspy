// cs-blessed-board-marks

import { useEffect, useState } from 'react'
import { playSound, preloadSound } from '../sounds/playSound'
import { YOUR_TURN_FLASH_MS } from './feedbackTiming'
import { useTurnArrival } from './useTurnArrival'

/**
 * Mark the moment the turn becomes MINE, two ways at once: the bell rings, and
 * the returned flag is true for a beat, driving the shared `.yourTurnFlash`
 * frame (common/game-page/playArea.module.css). One hook, so the frame and the
 * sound can never mark different moments.
 *
 * The moment is `useTurnArrival`'s — never on mount, rising edge only. Losing
 * the turn is announced by the board dimming, a state rather than an event, but
 * it does take a frame still up OFF at once: you acted, so the announcement is
 * spent. The turn coming back is a fresh arrival on a full clock.
 *
 * A game calls it once from its PlayArea with `gd.me.onTurn`; `null` while that
 * is not known yet, so the load itself marks nothing. A finished game passes
 * false, which is a falling edge, not an arrival. In a free-for-all game the
 * value never rises, so nothing is marked and no gate is needed at the call.
 *
 * Whether the bell sounds at all is `playSound`'s to decide, from the player's
 * "Enable sounds" setting. The file is fetched on mount, so the first ring is
 * not late.
 *
 * Why the turn arriving needs a mark of its own: common/board-marks/doc.md.
 */
export function useTurnStartFlash(myTurn: boolean | null): boolean {
  const arrivals = useTurnArrival(myTurn)

  // The arrival whose beat has run out. The frame is up while it is my turn and
  // the latest arrival is newer than that.
  const [spent, setSpent] = useState(0)

  useEffect(function preloadBell() {
    preloadSound('bell')
  }, [])

  useEffect(function ringOnArrival() {
    if (arrivals === 0) return
    playSound('bell')
  }, [arrivals])

  useEffect(function takeFrameOffAfterBeat() {
    if (arrivals === 0) return
    const timer = setTimeout(() => setSpent(arrivals), YOUR_TURN_FLASH_MS)
    return () => clearTimeout(timer)
  }, [arrivals])

  return myTurn === true && arrivals > spent
}
