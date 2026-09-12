// cs-audited-page-header

import type { Member } from '../members/member'
import type { FeedbackSlot } from '../feedback/feedbackSlotStore'
import { useTopFeedbackMessage } from '../feedback/useFeedbackSlot'
import { FeedbackPill } from '../feedback/FeedbackPill'
import { PageHeaderPlayersStrip } from './PageHeaderPlayersStrip'
import styles from './PageHeaderStatusSlot.module.css'

type Props = {
  players: Member[]
  // The page's global feedback slot; the pill draws its top message here.
  globalFeedbackSlot: FeedbackSlot
  // Forwarded to PageHeaderPlayersStrip — when set, absent members render as a
  // hollow dot. The club page passes its live presence set; the in-game header
  // omits it.
  presentUserIds?: Set<string>
}

/**
 * The middle cell of the page header. Two states:
 *
 *  - **default**: `<PageHeaderPlayersStrip>` — colored usernames, the
 *    "who's playing and what color is who" reminder.
 *  - **feedback**: `<FeedbackPill>` — the global slot's top message,
 *    replacing the strip while one is showing.
 *
 * Swapping between them reflows nothing: `<PageHeader>` fixes the strip's
 * height, and both states fit inside it (docs/ui.md → Layout stability).
 *
 * Pause transitions don't clear feedback — the slot sits in the header,
 * which is outside `<PauseOverlay>`'s coverage, so an active message stays
 * readable through a pause. A message that should drop on pause is its
 * owner's to retract.
 */
export function PageHeaderStatusSlot({ players, globalFeedbackSlot, presentUserIds }: Props) {
  const showing = useTopFeedbackMessage(globalFeedbackSlot) !== null
  return (
    <div className={styles.slot}>
      {showing ? (
        <FeedbackPill slot={globalFeedbackSlot} />
      ) : (
        <PageHeaderPlayersStrip players={players} presentUserIds={presentUserIds} />
      )}
    </div>
  )
}
