// cs-unmet

import { useMemo, useState } from 'react'
import type { FeedbackSlot } from '@/common/feedback/feedbackSlotStore'
import { isAdjacent } from '../lib/board'
import { traceCells } from '../lib/boardTrace'
import { useSubmitWord } from './useSubmitWord'
import type { GGameData, GTile } from '../types'

/**
 * The word being built on the board — typed, or traced by tapping tiles — and
 * everything the board and the entry row read off it. The word is shared by
 * both, which is why it lives here, above them: a tap adds a letter to the
 * entry, and a typed letter lights tiles on the board.
 *
 * - **The move** is `useSubmitWord`'s: the typed word, its submission, and the
 *   refused word's mark.
 * - **A tapped path** is held as tile ids, in the order tapped. A tap on a
 *   tile already in it un-picks it and everything after; a tap elsewhere
 *   extends it only along a neighbor.
 * - **Typing** makes the word stop describing the path, so the path goes; but
 *   a one-letter shortening of the tapped word can only be Backspace, which
 *   steps the path back one tile — both letters of a `qu` tile at once.
 * - **Trace as you type**: every letter lights the tiles that could carry it,
 *   settled where only one can and held back where several can, so the board
 *   only ever ADDS certainty as the word grows.
 */
export function useTracedWord({
  gd,
  isInteractive,
  localFeedbackSlot,
}: {
  gd: GGameData
  isInteractive: boolean
  localFeedbackSlot: FeedbackSlot
}) {
  const submission = useSubmitWord({
    gameId: gd.id,
    words: gd.puzzle.words,
    foundWords: gd.foundWords,
    board: gd.puzzle.traceBoard,
    minWordLength: gd.puzzle.minWordLength,
    isMyTurn: isInteractive,
    localFeedbackSlot,
  })

  const typedCells = useMemo(
    () => (submission.word.length > 0 ? traceCells(gd.puzzle.traceBoard, submission.word) : null),
    [gd.puzzle.traceBoard, submission.word],
  )

  // The tile ids tapped so far, in trace order.
  const [pathIds, setPathIds] = useState<string[]>([])
  const spell = (ids: readonly string[]) =>
    ids.map((id) => gd.puzzle.tilesById.get(id)!.letters!).join('')

  function tapTile(tile: GTile) {
    // A tap is my next action, so it dismisses a gesture-cleared result.
    localFeedbackSlot.dismiss()
    const at = pathIds.indexOf(tile.id)
    const lastId = pathIds.at(-1)
    let next: string[]
    if (at >= 0) {
      next = pathIds.slice(0, at)
    } else if (lastId === undefined || isAdjacent(lastId, tile.id, gd.puzzle.boardSideSize)) {
      next = [...pathIds, tile.id]
    } else {
      return
    }
    setPathIds(next)
    submission.setWord(spell(next))
  }

  function changeWord(next: string) {
    const isTraced = pathIds.length > 0 && submission.word === spell(pathIds)
    if (isTraced && next === submission.word.slice(0, -1)) {
      const back = pathIds.slice(0, -1)
      setPathIds(back)
      submission.setWord(spell(back))
      return
    }
    setPathIds([])
    submission.setWord(next)
  }

  function submitWord() {
    setPathIds([])
    submission.submit()
  }

  const refused = submission.refused
  return {
    word: submission.word,
    lastWord: submission.lastWord,
    // How many of its letters the board can spell, from the start. A tapped
    // word is traced by construction, so it is the whole length.
    reach: typedCells?.reach ?? submission.word.length,
    changeWord,
    submitWord,
    tapTile,
    marks: {
      pathIds,
      settledIds: new Set(typedCells?.settled.map(String) ?? []),
      maybeIds: new Set(typedCells?.maybe.map(String) ?? []),
      refused: refused
        ? {
            ids: new Set(refused.value.cells.map(String)),
            outcome: refused.value.outcome,
            nonce: refused.nonce,
          }
        : null,
    },
  }
}
