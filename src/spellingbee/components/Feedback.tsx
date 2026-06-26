import { cls } from '../../common/lib/cls'
import styles from './Feedback.module.css'

/**
 * Tone palette for the in-body word-result pill. Deliberately NOT the
 * common `FeedbackTone` (success/error/neutral/info): this pill has a
 * `warning` tone (too-short / not-a-word) the header palette lacks, and
 * it's a different surface — the header slot reports peer/opponent
 * events, this reports the player's own submission. Distinct name so
 * the two never get conflated. See docs/games/spellingbee.md → Feedback.
 */
export type WordResultTone = 'success' | 'warning' | 'error'

type Props = {
  /** Empty string → no pill rendered. Lets the caller clear by
   *  passing `''` rather than swapping the whole element in/out. */
  message: string
  tone: WordResultTone
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
