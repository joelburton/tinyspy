// cs-unmet

import { useBoundAction, type BoundAction } from '@/common/actions/useBoundAction'

/**
 * The board column's two commands, on their buttons and their keys: Submit
 * (Enter) guesses the picked word, and Clear (⌫) un-picks it. Both act on the
 * pick whether or not the keyboard cursor shows, since the pick is always
 * drawn. The board's own Shuffle is bound with the board (`useWordShuffle`).
 */
export function useBoardColActions({
  pickedWord,
  canPick,
  canSubmit,
  isSubmitting,
  choosePickedWord,
  clearPickedWord,
  submitGuess,
}: {
  pickedWord: string | null
  // A pick can be made or cleared right now.
  canPick: boolean
  // It is my move, and a guess can go.
  canSubmit: boolean
  // A guess is out with the server.
  isSubmitting: boolean
  choosePickedWord: (word: string | null) => void
  // Un-pick without dismissing the slot's result (see `usePickedWord`).
  clearPickedWord: () => void
  submitGuess: (word: string) => Promise<void>
}): {
  actSubmit: BoundAction
  actClearPicks: BoundAction
} {
  const actSubmit = useBoundAction('act-submit', {
    describe: () =>
      canSubmit && pickedWord !== null && !isSubmitting ? 'active' : 'disabled',
    run: async () => {
      if (pickedWord === null) return
      clearPickedWord()
      await submitGuess(pickedWord)
    },
  })

  const actClearPicks = useBoundAction('act-clear-picks', {
    describe: () => (canPick && pickedWord !== null ? 'active' : 'disabled'),
    run: () => choosePickedWord(null),
  })

  return { actSubmit, actClearPicks }
}
