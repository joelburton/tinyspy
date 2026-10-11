// cs-unmet

import { useState } from 'react'
import { useMarkBeat } from '@/common/board-marks/useMarkBeat'
import { useTurnArrival } from '@/common/board-marks/useTurnArrival'
import type { GGameData } from '../types'

/**
 * The two moments a FlipWord round marks, each a frame around the board for a
 * beat and a sound on the same edge (`useMarkBeat`) — never on mount, since
 * opening a game is not either moment:
 *
 *   isNewTableFlashing   the next round's table is dealt, once everyone has
 *                        pressed Start. Everyone, in the yellow attention
 *                        frame, with the bell.
 *   isClockStartFlashing a rival's first word has started the round's clock on
 *                        me. Everyone but the player who entered it, in the
 *                        caution frame, with the timer sound.
 *
 * A Restart deals round 1 again: the round's number drops, which is not a
 * new table arriving.
 */
export function useRoundMarks(gd: GGameData): {
  isNewTableFlashing: boolean
  isClockStartFlashing: boolean
} {
  // A new table: the round's number going up, detected during render.
  const [prevNum, setPrevNum] = useState(gd.round.num)
  const [newTables, setNewTables] = useState(0)
  if (gd.round.num !== prevNum) {
    setPrevNum(gd.round.num)
    if (gd.round.num > prevNum) setNewTables((n) => n + 1)
  }

  // The clock starting on me: its rising edge, `useTurnArrival`'s count.
  const clockStarts = useTurnArrival(
    gd.round.isTimerRunning && gd.me.stillPlaying && !gd.me.isWordFrozen)

  return {
    isNewTableFlashing: useMarkBeat(newTables, 'bell'),
    isClockStartFlashing: useMarkBeat(clockStarts, 'timer'),
  }
}
