// cs-unmet

import { useCallback, useState } from 'react'
import type { Action } from '@/common/actions/useBindAction'
import type { FeedbackSlot } from '@/common/feedback/feedbackSlotStore'
import { asciiLetters, useCaptureKeys } from '@/common/keyboard/useCaptureKeys'
import { WORD_LENGTH } from '../lib/setup'

/**
 * The word being typed, from either keyboard. wordleone has no text box — the
 * letters land on the board's typing row — so the physical keys come through
 * the shared capture core (`useCaptureKeys`), and an on-screen cap calls
 * `typeLetter`. Its ⌫ and Enter caps ARE the capture's `actDeleteLast` and
 * `actSubmit`, so a cap and its key cannot disagree about whether the
 * move is available.
 *
 * Typing a letter is the player's next move, so it dismisses a gesture-cleared
 * message in the slot; ⌫ dismisses on its way through the capture. Enter hands
 * the word to `submitGuess` and waits for it: the solve clears the row at once,
 * a judged word that is not the answer when its shake ends, and a word the
 * server never judged stays to be fixed.
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
  // Resolves to whether to clear the row now; handed a clear for later, which
  // a miss runs when its shake ends (`useSubmitGuess`).
  submitGuess: (word: string, clearTypedWord: () => void) => Promise<boolean>
}): {
  word: string
  typeLetter: (letter: string) => void
  // The entry's two commands, on their keys and the on-screen keyboard.
  actions: { actDeleteLast: Action; actSubmit: Action }
} {
  const [typedWord, setTypedWord] = useState('')

  const typeLetter = useCallback((letter: string) => {
    localFeedbackSlot.dismiss()
    setTypedWord(
      (word) =>
        (word.length < WORD_LENGTH ? word + letter.toLowerCase() : word))
  }, [localFeedbackSlot])

  async function submitTypedWord() {
    const isCleared = await submitGuess(typedWord, () => setTypedWord(''))
    if (isCleared) setTypedWord('')
  }

  const { actDeleteLast, actSubmit } = useCaptureKeys({
    pendingText: typedWord,
    onChange: setTypedWord,
    onSubmit: submitTypedWord,
    charFor: asciiLetters(),
    onAnyKey: localFeedbackSlot.dismiss,
    disabled: !canType,
    maxLength: WORD_LENGTH,
  })

  return { word: typedWord, typeLetter, actions: { actDeleteLast, actSubmit } }
}
