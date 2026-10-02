// cs-unmet

import { useState } from 'react'
import { useMark, type Mark } from '@/common/board-marks/useMark'
import { NO_TIMER } from '@/common/board-marks/feedbackTiming'
import type { FeedbackSlot } from '@/common/feedback/feedbackSlotStore'
import type { FeedbackMessage } from '@/common/feedback/FeedbackMessage'
import { useTopFeedbackMessage } from '@/common/feedback/useFeedbackSlot'
import type { Outcome } from '@/common/outcomes/outcomes'
import type { EventRow } from './useGame'

/** The answer to the last guess, worn by the four tiles it covered. */
export type BoardVerdict = {
  tiles: ReadonlySet<string>
  // ANY outcome, because the mark wears its PILL's outcome — the two are one
  // message — and the pill speaks the full vocabulary.
  outcome: Outcome
}

/**
 * The verdict fill: the four tiles of the last answered guess, in the outcome
 * its pill wears. The two are one message arriving in two places, so they
 * share a color and a lifetime.
 *
 * **Raised two ways.** `showFor(tiles, message)` shows the message into
 * the slot and fills the tiles, for my own guess's answer and for a refusal.
 * A TEAMMATE's wrong guess arriving in the log marks their four here too —
 * their own client marked the same four from its own answer a beat earlier. A
 * correct guess needs no mark: its band arrives on the same render.
 *
 * **Ended two ways.** A mark about my own guess remembers which slot entry it
 * belongs to (`msgId`) and is drawn only while that entry is in the slot, so
 * a tap on the pill takes the fill with it. Every mark ends when the board
 * stops being the board it was about, which the guess log shows: a row
 * SOMEBODY ELSE wrote means the board has moved on. My own row growing the log
 * is the tail of the action that set the mark, arriving a beat later, so it
 * does not end it. Neither has a timer (`NO_TIMER`).
 *
 * ANNOUNCED, so the mark carries both beats itself: the attention flash says
 * WHERE the answer landed, and the fill and head-shake that follow say what it
 * was. Every verdict that lands on tiles is a refusal (a correct guess takes
 * its four away), so the shake needs no outcome test.
 *
 * The log comparison runs during RENDER, so a cleared mark and the board that
 * cleared it land in the same commit (`useMark`'s `show` and `clear` are plain
 * state updates).
 */
export function useVerdictMark({
  guesses,
  myId,
  localFeedbackSlot,
  isViewingHistory,
}: {
  // The guess log on MY board.
  guesses: readonly EventRow[]
  // Null for a club member watching, to whom every row is somebody else's.
  myId: string | null
  localFeedbackSlot: FeedbackSlot
  // A past turn on screen: a teammate's row marks nothing there.
  isViewingHistory: boolean
}): {
  // The mark to draw, or null — gone with its slot entry, or when nothing is
  // being judged.
  mark: Mark<BoardVerdict> | null
  // Show a message into the slot and fill these tiles in its outcome.
  showFor: (tiles: readonly string[], message: FeedbackMessage) => void
  clear: () => void
} {
  const [verdict, showVerdict, clearVerdict] =
    useMark<BoardVerdict & { msgId: string | null }>(NO_TIMER)

  function showFor(tiles: readonly string[], message: FeedbackMessage) {
    const msgId = localFeedbackSlot.show(message)
    showVerdict(
      { tiles: new Set(tiles), outcome: message.outcome, msgId },
      { attention: true },
    )
  }

  // Subscribes to the slot, so the mark re-derives when its message leaves.
  useTopFeedbackMessage(localFeedbackSlot)
  const isMarkShown =
    verdict !== null &&
    (verdict.value.msgId === null ||
      localFeedbackSlot.peek().some((entry) => entry.id === verdict.value.msgId))

  // The log moved: a row somebody else wrote ends my mark and, for a wrong
  // guess, raises theirs.
  const newestGuess = guesses.length > 0 ? guesses[guesses.length - 1]! : null
  const [seenGuess, setSeenGuess] = useState({
    count: guesses.length,
    id: newestGuess?.id ?? null,
  })
  if (guesses.length !== seenGuess.count || (newestGuess?.id ?? null) !== seenGuess.id) {
    setSeenGuess({ count: guesses.length, id: newestGuess?.id ?? null })
    const isForeign = newestGuess !== null && newestGuess.user_id !== myId
    if (isForeign) {
      const marksTheirTiles = !isViewingHistory && newestGuess.outcome !== 'won'
      if (marksTheirTiles) {
        showVerdict(
          { tiles: new Set(newestGuess.tiles), outcome: newestGuess.outcome, msgId: null },
          { attention: true },
        )
      } else {
        clearVerdict()
      }
    }
  }

  return {
    mark: isMarkShown ? verdict : null,
    showFor,
    clear: clearVerdict,
  }
}
