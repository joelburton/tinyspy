// cs-unmet

import { useEffect, useState } from 'react'
import { YOUR_TURN_FLASH_MS } from '@/common/board-marks/feedbackTiming'
import { useTurnArrival } from '@/common/board-marks/useTurnArrival'
import { playSound, preloadSound, type SoundName } from '@/common/sounds/playSound'
import type { GGameData } from '../types'

/**
 * The two moments a FlipWord round marks, each a frame around the board for a
 * beat and a sound on the same edge — never on mount, since opening a game is
 * not either moment:
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
    isNewTableFlashing: useBeat(newTables, 'bell'),
    isClockStartFlashing: useBeat(clockStarts, 'timer'),
  }
}

/**
 * One mark's beat: `sound` plays each time `count` goes up, and the result is
 * true until the beat has run. The sound's file is fetched on mount, so the
 * first one is not late.
 */
function useBeat(count: number, sound: SoundName): boolean {
  // The count whose beat has run out.
  const [spent, setSpent] = useState(0)

  useEffect(function preload() {
    preloadSound(sound)
  }, [sound])

  useEffect(function playOnArrival() {
    if (count === 0) return
    playSound(sound)
  }, [count, sound])

  useEffect(function takeFrameOffAfterBeat() {
    if (count === 0) return
    const timer = setTimeout(() => setSpent(count), YOUR_TURN_FLASH_MS)
    return () => clearTimeout(timer)
  }, [count])

  return count > spent
}
