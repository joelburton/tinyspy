// cs-unmet

import { useBindAction } from '@/common/actions/useBindAction'
import type { GTile } from '../types'

/**
 * The board column's two keys: Enter guesses the picked tile, and ⌫ un-picks
 * it. Key-only — a click is the board's own guess — so Enter names itself
 * "Guess" for the key list, and both hide when I am not the one guessing.
 */
export function useBoardColActions({
  pickedTile,
  canGuess,
  choosePickedTile,
  clearPickedTile,
  sendGuess,
  isGuessOut,
}: {
  pickedTile: GTile | null
  // I may guess right now.
  canGuess: boolean
  choosePickedTile: (tile: GTile | null) => void
  clearPickedTile: () => void
  sendGuess: (tile: GTile) => void
  // A guess is still out with the server; the next waits for its reveal.
  isGuessOut: boolean
}) {
  useBindAction('act-submit', {
    describe: () => {
      if (!canGuess) return 'hidden'
      return { state: pickedTile !== null && !isGuessOut ? 'active' : 'disabled', label: 'Guess' }
    },
    run: () => {
      if (pickedTile === null) return
      clearPickedTile()
      sendGuess(pickedTile)
    },
  })

  useBindAction('act-clear-picks', {
    describe: () => {
      if (!canGuess) return 'hidden'
      return pickedTile !== null ? 'active' : 'disabled'
    },
    run: () => choosePickedTile(null),
  })
}
