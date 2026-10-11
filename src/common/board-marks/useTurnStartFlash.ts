// cs-blessed-board-marks

import { useMarkBeat } from './useMarkBeat'
import { useTurnArrival } from './useTurnArrival'

/**
 * Mark the moment the turn becomes MINE, two ways at once: the bell rings, and
 * the returned flag is true for a beat, driving the shared `.yourTurnFlash`
 * frame (common/game-page/playArea.module.css). One hook, so the frame and the
 * sound can never mark different moments (`useMarkBeat`).
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
  const isBeating = useMarkBeat(useTurnArrival(myTurn), 'bell')
  return myTurn === true && isBeating
}
