// cs-unmet

import { useBindAction, type Action } from '@/common/actions/useBindAction'
import type { TileWord } from '../lib/tileResults'

/**
 * The board column's two commands, on their buttons and their keys: Submit
 * (Enter) guesses the picked word, and Clear (⌫) un-picks it. Both act on the
 * pick whether or not the keyboard cursor shows, since the pick is always
 * drawn. The board's own Shuffle is bound with the board (`useWordShuffle`).
 *
 * One guess is out at a time: Submit's run waits for `submitGuess`, and an
 * action neither runs nor draws live while its run is out
 * (`useBindAction`'s `pending`).
 */
export function useBoardColActions({
  pickedWord,
  canPick,
  canSubmit,
  choosePickedWord,
  clearPickedWord,
  submitGuess,
}: {
  pickedWord: TileWord | null
  // A pick can be made or cleared right now.
  canPick: boolean
  // It is my move, and a guess can go.
  canSubmit: boolean
  choosePickedWord: (word: TileWord | null) => void
  // Un-pick without dismissing the slot's result (see `usePickedWord`).
  clearPickedWord: () => void
  submitGuess: (word: TileWord) => Promise<void>
}): {
  actSubmit: Action
  actClearPicks: Action
} {
  const actSubmit = useBindAction('act-submit', {
    describe: () => (canSubmit && pickedWord !== null ? 'active' : 'disabled'),
    run: async () => {
      if (pickedWord === null) return
      clearPickedWord()
      await submitGuess(pickedWord)
    },
  })

  const actClearPicks = useBindAction('act-clear-picks', {
    describe: () => (canPick && pickedWord !== null ? 'active' : 'disabled'),
    run: () => choosePickedWord(null),
  })

  return { actSubmit, actClearPicks }
}
