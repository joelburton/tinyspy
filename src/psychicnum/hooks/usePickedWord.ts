// cs-unmet

import { useCallback, useState } from 'react'
import type { FeedbackSlot } from '@/common/feedback/feedbackSlotStore'

/**
 * The word the player has picked as their next guess, or null.
 *
 * `shownPickedWord` is the pick as the board draws it: null while I cannot
 * play (the game ended, or I have ended) — a pick means "the move I am
 * building", and a tile picked just before that moment must not keep its
 * border, since nothing else would take it off — and null while a past turn
 * is open. Waiting my turn is not that: the pick stays for when the turn comes
 * back.
 *
 * Two ways to change it. `choosePickedWord` is the player's own gesture (a
 * tile, Space, Clear), so it also dismisses a result the slot shows until the
 * next gesture. `clearPickedWord` is for Submit, which is about to show a
 * result of its own and must not dismiss it.
 */
export function usePickedWord({
  localFeedbackSlot,
  isStillPlaying,
  isViewingHistory,
}: {
  localFeedbackSlot: FeedbackSlot
  isStillPlaying: boolean
  isViewingHistory: boolean
}): {
  pickedWord: string | null
  shownPickedWord: string | null
  choosePickedWord: (word: string | null) => void
  clearPickedWord: () => void
} {
  const [pickedWord, setPickedWord] = useState<string | null>(null)

  const choosePickedWord = useCallback(
    (word: string | null) => {
      localFeedbackSlot.dismiss()
      setPickedWord(word)
    },
    [localFeedbackSlot],
  )
  const clearPickedWord = useCallback(() => setPickedWord(null), [])

  const isPickShown = isStillPlaying && !isViewingHistory
  return {
    pickedWord,
    shownPickedWord: isPickShown ? pickedWord : null,
    choosePickedWord,
    clearPickedWord,
  }
}
