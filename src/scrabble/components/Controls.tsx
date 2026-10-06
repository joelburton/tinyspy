// cs-unmet

import type { FeedbackSlot } from '@/common/feedback/feedbackSlotStore'
import { FeedbackPill } from '@/common/feedback/FeedbackPill'
import { useWatchAndGetTopFeedbackMsg } from '@/common/feedback/useFeedbackSlot'
import { ActionButton } from '@/common/actions/ActionButton'
import type { Action } from '@/common/actions/useBindAction'
import { SubmitWithScore } from '@/common/buttons/SubmitWithScore'
import { cls } from '@/common/utils/cls'
import styles from './Controls.module.css'
import shared from '@/common/game-page/playArea.module.css'

/**
 * The controls half of scrabble's below-board row (the rack, with its floating
 * Shuffle, is drawn beside it by BoardCol). Recall and Show move on the left;
 * the **move slot** — Swap, Pass, Submit — pushed to the right edge. That slot
 * doubles as the **local feedback area**: while the slot holds a message it
 * draws the `<FeedbackPill>` in place of the buttons AND fills the whole space,
 * so a longer message reads before it clips. Show move sits on the left so a
 * pill never hides it.
 *
 * Every one of them is an ACTION: what it does, what it is called, whether it
 * can be pressed and which key also does it come from the action, which the
 * board column binds. This row decides placement and nothing else.
 */
export function Controls({
  submitScore,
  actSubmit,
  actRecallTiles,
  actSharePreview,
  actExchange,
  actPass,
  localFeedbackSlot,
}: {
  // The staged play's score for Submit to show; null (nothing staged) shows an
  // em-dash. Its own prop: the score is what the button DRAWS, where the action
  // says whether it can be pressed.
  submitScore: number | null
  actSubmit: Action
  actRecallTiles: Action
  actSharePreview: Action
  actExchange: Action
  actPass: Action
  // PlayArea's below-board slot, drawn IN the move slot while it holds anything.
  localFeedbackSlot: FeedbackSlot
}) {
  const top = useWatchAndGetTopFeedbackMsg(localFeedbackSlot)
  return (
    <div className={styles.controls}>
      <ActionButton action={actRecallTiles} show="icon" />
      <ActionButton action={actSharePreview} show="icon" />

      <div
        className={cls(
          styles.moveAreaOrLocalFeedback,
          top !== null && styles.moveAreaOrLocalFeedbackPill)
      }
      >
        {top !== null ? (
          <div className={shared.localFeedback}>
            <FeedbackPill slot={localFeedbackSlot} />
          </div>
        ) : (
          <div className={styles.moveButtons}>
            <ActionButton action={actExchange} show="icon" />
            <ActionButton action={actPass} show="icon" />
            <SubmitWithScore score={submitScore} action={actSubmit} />
          </div>
        )}
      </div>
    </div>
  )
}
