// cs-unmet

import type { FeedbackSlot } from '@/common/feedback/feedbackSlotStore'
import { FeedbackPill } from '@/common/feedback/FeedbackPill'
import { useWatchAndGetTopFeedbackMsg } from '@/common/feedback/useFeedbackSlot'
import { ClueText } from './ClueText'
import styles from './ActiveClueBar.module.css'

type Props = {
  localFeedbackSlot: FeedbackSlot
  // The clue under the cursor: its label ("12A") and its text. Null on a cell
  // no clue covers.
  clue: { label: string; text: string } | null
}

/**
 * The active-clue bar, which doubles as the local slot: whatever the slot holds
 * on top — a refusal, the verdict, "you're out", the pencil note — and else the
 * clue under the cursor. On a phone it is the one clue readout the main view
 * shows, right under the grid.
 */
export function ActiveClueBar({ localFeedbackSlot, clue }: Props) {
  const topFeedbackMsg = useWatchAndGetTopFeedbackMsg(localFeedbackSlot)
  return (
    // data-active-clue: a stable e2e handle (the class name is hashed).
    <div className={styles.activeClue} data-active-clue>
      {topFeedbackMsg !== null ? (
        <FeedbackPill slot={localFeedbackSlot} />
      ) : (
        clue !== null && (
          <>
            <span className={styles.activeClueLabel}>{clue.label}</span>
            <span className={styles.activeClueText}>
              <ClueText text={clue.text} />
            </span>
          </>
        )
      )}
    </div>
  )
}
