// cs-unmet

import { cls } from '../utils/cls'
import type { EndOutcome } from '../terminal/gameEnding'
import shared from './playArea.module.css'

/**
 * The classes for the frame an ended board wears: `.endingFrame`, colored by
 * `.endingFrame_${outcome}`, or null when there is no frame to draw.
 *
 * No frame while a past turn is open: both frames are outlines, so they take
 * turns, and the history viewer owns it — the state you chose and the one you
 * can leave.
 */
export function makeEndingFrameClasses(
  outcome: EndOutcome | null,
  isViewingHistory: boolean,
): string | null {
  if (outcome === null || isViewingHistory) return null
  return cls(shared.endingFrame, shared[`endingFrame_${outcome}`])
}
