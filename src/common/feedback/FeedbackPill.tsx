// cs-met-feedback

import { cls } from '../utils/cls'
import { DotActor } from '../members/ActorMention'
import { CloseButton } from '../buttons/CloseButton'
import type { FeedbackSlot } from './feedbackSlotStore'
import { useTopFeedbackMessage } from './useFeedbackSlot'
import styles from './FeedbackPill.module.css'

type Props = {
  // The slot to draw. The pill subscribes to it and renders nothing while
  // it is empty; the host reserves the height (docs/ui.md → Layout stability).
  slot: FeedbackSlot
  // Merged onto the pill — for the host's placement (centered under a board,
  // left-justified in a header).
  className?: string
}

/**
 * THE FEEDBACK PILL — draws whatever a slot holds on top, and gives the player
 * the two ways out its kind allows.
 *
 * Put one where the slot's messages belong: under the board for the local
 * slot, in the header's status slot for the global one. Everything it shows
 * is decided by the message's kind (`FeedbackMessage`): the outcome colors
 * the whole border, `fill` tints the background for a state that is final,
 * a tap on the body ends a gesture-cleared message, and the × appears only on
 * a message that leaves by the ×. A message with an `actor` leads with the
 * name-and-disc mention, which drops to the disc on a phone.
 *
 * A plain click target, never a `role="button"`: a board can show a hundred
 * of these over a game and none should become a tab stop. `cursor: pointer`
 * tells a mouse user what the tap teaches by working.
 */
export function FeedbackPill({ slot, className }: Props) {
  const feedbackMsg = useTopFeedbackMessage(slot)
  if (feedbackMsg === null) return null
  const tappable = feedbackMsg.leavesBy === 'gesture'
  return (
    <div
      className={cls(
        styles.pill,
        styles[feedbackMsg.outcome],
        !feedbackMsg.fill && styles.outline,
        tappable && styles.tappable,
        className,
      )}
      onClick={tappable ? slot.dismiss : undefined}
    >
      {feedbackMsg.actor !== undefined && (
        <DotActor actor={feedbackMsg.actor} fallback="a player" className={styles.actor} />
      )}
      <span className={styles.text}>{feedbackMsg.text}</span>
      {feedbackMsg.leavesBy === 'close' && (
        <CloseButton show="icon" label="Dismiss" className={styles.close} onClick={slot.close} />
      )}
    </div>
  )
}
