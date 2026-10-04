// cs-unmet

import { useMemo, useState } from 'react'
import { useBindAction, type Action } from '@/common/actions/useBindAction'
import { shuffle } from '@/common/utils/shuffle'

/**
 * The board's display order, and the Shuffle that changes it: the same outer
 * letters in a fresh arrangement around the center, purely visual and purely
 * local — never a move, never sent anywhere. A fresh scan of the same letters
 * is how a word that was hiding gets found, so the Shuffle is live in every
 * state, a finished board included.
 *
 * Binds `act-shuffle`, so the floating button, the menu row and ⌥Z are one
 * action.
 *
 * The order is derived from a counter the Shuffle bumps and keyed on the
 * letters as the STRING the puzzle holds them in: a reload hands the page a
 * fresh blob, and keying on anything rebuilt with it would reshuffle the board
 * on every submit.
 */
export function useTileShuffle(outerLetters: string): {
  // The outer letters in display order.
  outerLetters: string[]
  actShuffle: Action
} {
  const [shuffleSeed, setShuffleSeed] = useState(0)
  const shuffled = useMemo(() => {
    void shuffleSeed
    return shuffle(Array.from(outerLetters))
  }, [outerLetters, shuffleSeed])
  const actShuffle = useBindAction('act-shuffle', {
    describe: () => 'active',
    run: () => setShuffleSeed((s) => s + 1),
  })
  return { outerLetters: shuffled, actShuffle }
}
