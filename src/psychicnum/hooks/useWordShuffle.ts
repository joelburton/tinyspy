// cs-unmet

import { useCallback, useMemo, useState } from 'react'
import { useBoundAction, type BoundAction } from '@/common/actions/useBoundAction'
import { shuffle } from '@/common/utils/shuffle'

/**
 * The board's display order, and the Shuffle that changes it: the same words
 * in a fresh arrangement, purely visual and purely local — never a move, never
 * sent anywhere.
 *
 * Binds `act-shuffle`, live in every state (an ended game included), so its
 * key works whatever the board is doing.
 *
 * The order is derived from a counter the Shuffle bumps, keyed on the words as
 * a STRING rather than the array: `useGame` hands a fresh array on every
 * reload, and keying on it would reshuffle the board on every guess.
 */
export function useWordShuffle(words: readonly string[]): {
  shuffledWords: string[]
  actShuffle: BoundAction
} {
  const [shuffleSeed, setShuffleSeed] = useState(0)
  // '\n' never appears inside a dictionary word.
  const wordsKey = words.join('\n')
  const shuffledWords = useMemo(() => {
    if (wordsKey === '') return []
    void shuffleSeed
    return shuffle(wordsKey.split('\n'))
  }, [wordsKey, shuffleSeed])

  const reshuffle = useCallback(() => setShuffleSeed((s) => s + 1), [])
  const actShuffle = useBoundAction('act-shuffle', {
    describe: () => 'active',
    run: reshuffle,
  })

  return { shuffledWords, actShuffle }
}
