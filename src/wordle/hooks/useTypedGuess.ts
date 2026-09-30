// cs-unmet

import { useCallback, useState } from 'react'
import type { BoundAction } from '@/common/actions/useBoundAction'
import type { FeedbackSlot } from '@/common/feedback/feedbackSlotStore'
import { asciiLetters, useCaptureKeys } from '@/common/keyboard/useCaptureKeys'
import { WORD_LENGTH } from '../lib/setup'

/**
 * The word being typed, from either keyboard. wordle has no text box — the
 * letters land on the board's typing row — so the physical keys come through
 * the shared capture core (`useCaptureKeys`), and an on-screen cap calls
 * `typeLetter`. Its ⌫ and Enter caps ARE the capture's `actDeleteLast` and
 * `actSubmit`, so a cap and its key cannot disagree about whether the
 * move is available.
 *
 * Typing a letter is the player's next move, so it dismisses a gesture-cleared
 * message in the slot; ⌫ dismisses on its way through the capture. Enter hands
 * the word to `submitGuess` and waits for it, clearing the row only once the
 * guess is accepted — a refused word stays to be fixed.
 *
 * `canType` off means the capture is not here at all: no typing, no submit and
 * no dismissal, which is what lets a key fall through to the history viewer's
 * exit instead of typing behind its banner.
 */
export function useTypedGuess({
  localFeedbackSlot,
  canType,
  submitGuess,
}: {
  localFeedbackSlot: FeedbackSlot
  canType: boolean
  // Resolves to whether the guess was accepted (`useSubmitGuess`).
  submitGuess: (word: string) => Promise<boolean>
}): {
  typedWord: string
  typeLetter: (letter: string) => void
  actDeleteLast: BoundAction
  actSubmit: BoundAction
} {
  const [typedWord, setTypedWord] = useState('')

  const typeLetter = useCallback((letter: string) => {
    localFeedbackSlot.dismiss()
    setTypedWord(
      (word) => (word.length < WORD_LENGTH ? word + letter.toLowerCase() : word))
  }, [localFeedbackSlot])

  async function submitTypedWord() {
    const isAccepted = await submitGuess(typedWord)
    if (isAccepted) setTypedWord('')
  }

  const { actDeleteLast, actSubmit } = useCaptureKeys({
    value: typedWord,
    onChange: setTypedWord,
    onSubmit: submitTypedWord,
    charFor: asciiLetters('lower'),
    onAnyKey: localFeedbackSlot.dismiss,
    disabled: !canType,
    maxLength: WORD_LENGTH,
  })

  return { typedWord, typeLetter, actDeleteLast, actSubmit }
}
