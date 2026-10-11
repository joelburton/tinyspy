// cs-unmet

import { useEffect, useState } from 'react'
import { playSound, preloadSound, type SoundName } from '../sounds/playSound'
import { YOUR_TURN_FLASH_MS } from './feedbackTiming'

/**
 * One moment marked two ways at once: `sound` plays each time `count` goes
 * up, and the returned flag is true for the frame's beat from that same rise,
 * so a frame and its sound can never mark different moments. The count is the
 * caller's edge detector — `useTurnArrival`'s arrivals, or a game's own — and
 * a count that never rises marks nothing, mount included. The sound's file is
 * fetched on mount, so the first one is not late.
 *
 * Whether the sound is audible is `playSound`'s to decide, from the player's
 * "Enable sounds" setting.
 */
export function useMarkBeat(count: number, sound: SoundName): boolean {
  // The rise whose beat has run out. The flag is up while the latest rise is
  // newer than that.
  const [spent, setSpent] = useState(0)

  useEffect(function preload() {
    preloadSound(sound)
  }, [sound])

  useEffect(function playOnRise() {
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
