// cs-unmet

import { useState } from 'react'
import type { GEvent, GPlayer, GVerdictMark } from '../types'

/**
 * Mark a teammate's guess on my board as their row arrives in `guesses`:
 * their four tiles in their answer's color for a miss, and nothing for a
 * match — the band says it — which also takes down whatever mark was up,
 * since the board has moved on. No message is shown.
 *
 * Only rows by someone other than `me` count.  In compete
 * `guesses` holds only my rows, so this never fires there.
 *
 * The comparison runs during RENDER — the newest row's id against the one
 * last seen — so a mark and the board that moved under it land in the same
 * commit (`useMark`'s `show` and `clear` are plain state updates). */

export function useMarkForeignGuesses({
  guesses,
  me,
  isViewingHistory,
  verdict,
}: {
  // The guess log on MY board, in the order of play.
  guesses: readonly GEvent[]
  me: GPlayer
  isViewingHistory: boolean
  verdict: Pick<GVerdictMark, 'markTiles' | 'clear'>
}): void {

  // Rows are appended with rising ids and only ever removed all at once (a
  // Restart), so the newest row's id is enough to say the log moved.
  const newestGuess = guesses.length > 0 ? guesses[guesses.length - 1]! : null
  const newestId = newestGuess?.id ?? null
  const [seenId, setSeenId] = useState(newestId)

  if (newestId !== seenId) {
    setSeenId(newestId)
    const isForeign = newestGuess !== null && newestGuess.by !== me
    if (isForeign) {
      const marksTheirTiles = !isViewingHistory && newestGuess.outcome !== 'won'
      if (marksTheirTiles) {
        verdict.markTiles({
          tiles: newestGuess.tiles,
          outcome: newestGuess.outcome,
          message: null,
        })
      } else {
        // Their guess moved the board — four tiles became a band, or a past
        // turn is on screen — so whatever mark was up is about a board that
        // is gone.
        verdict.clear()
      }
    }
  }
}
