import { cls } from '../lib/cls'
import type { FeedbackMsg } from '../lib/games'
import styles from './FeedbackPill.module.css'

type Props = {
  msg: FeedbackMsg
  onClose: () => void
}

/**
 * The "what just happened" display, rendered inside `<StatusSlot>`
 * when `ctx.feedback.show()` has been called. See
 * docs/ui.md → "Feedback pill" for the full API contract.
 *
 * Three dismiss modes:
 *   - `timed`:    self-clears via `<GamePage>`'s auto-clear effect
 *                 — the pill renders, the timer in GamePage fires,
 *                 the message clears.
 *   - `sticky`:   stays until the caller's next `show()`/`clear()`.
 *                 The pill renders identically; only the lifetime
 *                 differs.
 *   - `closeable`: renders a × button that calls `onClose` (which
 *                 maps to `ctx.feedback.clear()` at the GamePage
 *                 level). Click-to-dismiss user-acknowledgment.
 *
 * Visual tone (`success` / `error` / `neutral` / `info`) picks a
 * background + border color via a CSS-class branch. The tones
 * are global UI-state vocabulary (see docs/ui.md → "Two
 * vocabularies") — a connections "wrong guess" pill should look
 * like a codenamesduet "clue invalid" pill should look like a future
 * Boggle "not a word" pill. Same component, same tone, same
 * paint.
 */
export function FeedbackPill({ msg, onClose }: Props) {
  return (
    <div className={cls(styles.pill, styles[msg.tone])}>
      <span className={styles.text}>{msg.text}</span>
      {msg.dismiss.kind === 'closeable' && (
        <button
          type="button"
          className={styles.close}
          onClick={onClose}
          aria-label="Dismiss"
        >
          ×
        </button>
      )}
    </div>
  )
}
