// cs-unmet

import { useCallback, type Dispatch, type SetStateAction } from 'react'
import type { Action } from '@/common/actions/useBindAction'
import type { FeedbackSlot } from '@/common/feedback/feedbackSlotStore'
import { useCaptureKeys, asciiLetters } from '@/common/keyboard/useCaptureKeys'
import { useArrowHistory } from '@/common/word-entry/useArrowHistory'

/** A generous cap on a single guess (the longest possible words are ~30). */
const MAX_LEN = 28

/**
 * The word being typed, from either keyboard. wordiply has no text box — the
 * letters land on the board's typing line — so the physical keys come through
 * the shared capture core (`useCaptureKeys`), and an on-screen cap calls
 * `typeLetter`. Its ⌫ and Enter caps ARE the capture's `actDeleteLast` and
 * `actSubmit`, so a cap and its key cannot disagree about whether the move is
 * available. ↑ recalls the last word and ↓ clears the entry
 * (`useArrowHistory`).
 *
 * The word itself is the submit engine's (`useSubmitGuess`); this hook only
 * types into it. Typing a letter is the player's next move, so it dismisses a
 * gesture-cleared message in the slot; ⌫ dismisses on its way through the
 * capture.
 *
 * `canType` off means the capture is not here at all: no typing, no submit and
 * no dismissal, which is what lets a key fall through to the history viewer's
 * exit instead of typing behind its banner.
 */
export function useTypedGuess({
  submission,
  localFeedbackSlot,
  canType,
}: {
  submission: {
    word: string
    setWord: Dispatch<SetStateAction<string>>
    lastWord: string
    submit: () => void
  }
  localFeedbackSlot: FeedbackSlot
  canType: boolean
}): {
  typeLetter: (letter: string) => void
  // The entry's two commands, on their keys and the on-screen keyboard.
  actions: { actDeleteLast: Action; actSubmit: Action }
} {
  const setWord = submission.setWord
  const typeLetter = useCallback(
    (letter: string) => {
      localFeedbackSlot.dismiss()
      setWord((word) => (word.length < MAX_LEN ? word + letter : word))
    },
    [localFeedbackSlot, setWord],
  )

  const { actDeleteLast, actSubmit } = useCaptureKeys({
    pendingText: submission.word,
    onChange: submission.setWord,
    onSubmit: submission.submit,
    disabled: !canType,
    onAnyKey: localFeedbackSlot.dismiss,
    charFor: asciiLetters(),
    maxLength: MAX_LEN,
  })
  useArrowHistory({ recall: submission.lastWord, onChange: submission.setWord, disabled: !canType })

  return { typeLetter, actions: { actDeleteLast, actSubmit } }
}
