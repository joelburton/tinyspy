import { cls } from '../../common/lib/cls'
import styles from './Feedback.module.css'

export type FeedbackTone = 'success' | 'warning' | 'error'

type Props = {
  /** Empty string → no pill rendered. Lets the caller clear by
   *  passing `''` rather than swapping the whole element in/out. */
  message: string
  tone: FeedbackTone
}

/**
 * A short, transient submission-result pill: "BEAD: +1",
 * "ALREADYFOUND", "BADLETTERS", etc. The caller decides when
 * to clear (typically via a setTimeout in PlayArea).
 *
 * Empty `message` renders an empty placeholder block — same
 * height as the message would have, so the layout doesn't
 * jump when feedback comes and goes.
 */
export function Feedback({ message, tone }: Props) {
  return (
    <div className={styles.feedback} role="status" aria-live="polite">
      {message && (
        <span className={cls(styles.message, styles[tone])}>{message}</span>
      )}
    </div>
  )
}
