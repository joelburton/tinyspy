// cs-unmet

import { useState } from 'react'
import type { GBoardColView, GGameData, GHistoryView } from '../types'

/**
 * Which surface the board column shows, decided once so the column is one
 * wrapper and one switch:
 *
 *   board           the table — the live round's, or a past round's while one
 *                   is open from the log, which beats every sheet
 *   roundSheet      between rounds: the finished round's scoresheet, with
 *                   "Start round N" under it
 *   lastRoundSheet  the game ended in front of me: the last round's sheet
 *                   first, with "Show final scores" under it
 *   gameSheet       the game's scoresheet, for good
 *
 * A game opened already over goes straight to the game's sheet, which is why
 * `isShowingFinalScores` starts as `gd.ended` and never reads it again: the
 * one-time step is for the player who watched the last round end. A Stop
 * mid-round ends the game with its round open, so it has no last round's
 * sheet to show and goes straight to the game's too.
 */
export function useBoardColView(gd: GGameData, historyView: GHistoryView): {
  view: GBoardColView
  // The press under the last round's sheet.
  showFinalScores: () => void
} {
  const [isShowingFinalScores, setIsShowingFinalScores] = useState(gd.ended)

  function getView(): GBoardColView {
    if (historyView.isViewing) return 'board'
    if (gd.ended && gd.round.ended && !isShowingFinalScores) return 'lastRoundSheet'
    if (gd.ended) return 'gameSheet'
    if (gd.isBetweenRounds) return 'roundSheet'
    return 'board'
  }

  return { view: getView(), showFinalScores: () => setIsShowingFinalScores(true) }
}
