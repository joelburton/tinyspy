import { cls } from '../../lib/util/cls'
import type { GenericFeedbackMsg } from '../../lib/games'
import styles from './GenericFeedbackPill.module.css'

type Props = {
  msg: GenericFeedbackMsg
  onClose: () => void
}

/**
 * The shared feedback pill — the "what just happened" display. It serves BOTH
 * feedback areas (docs/design-decisions.md → Terms): the GLOBAL one (the header
 * `<StatusSlot>`, via `ctx.globalFeedback.show()`, left-justified, for peer/opponent
 * messages) and the LOCAL one (a below-board slot a game renders directly,
 * centered, for the player's own move). See docs/ui.md → "Feedback pill" for the
 * full API contract.
 *
 * Three dismiss modes:
 *   - `timed`:    self-clears via `<GamePage>`'s auto-clear effect.
 *   - `sticky`:   stays until the caller's next `show()`/`clear()` (or, for a
 *                 directly-rendered local pill, until the host swaps it out).
 *   - `closeable`: renders a × button that calls `onClose`. Click-to-dismiss.
 *
 * Visual tone (`success` / `error` / `warning` / `neutral` / `info`) picks a
 * background + border color via a CSS-class branch. Tones are global UI-state
 * vocabulary (docs/ui.md → "Two vocabularies") — a connections "wrong guess"
 * pill looks like a codenamesduet "clue invalid" pill looks like a future Boggle
 * "not a word" pill.
 *
 * `msg.variant` is the transient-vs-permanent axis (docs/design-decisions.md →
 * Feedback):
 *   - `'outline'` → TRANSIENT: white background, tone-colored border.
 *   - omitted / `'fill'` → PERMANENT: a lightened-tone background + border, so it
 *     reads *more* like its tone (a terminal message, an end-game mode).
 * `msg.dot` is independent of that axis: a leading player-color disc naming the
 * actor in a peer message (docs/ui.md → "Player identity = a colored disc").
 */
export function GenericFeedbackPill({ msg, onClose }: Props) {
  const outline = msg.variant === 'outline'
  return (
    <div className={cls(styles.pill, styles[msg.tone], outline && styles.outline)}>
      {msg.dot && (
        <span
          className={styles.dot}
          style={{ background: msg.dot, borderColor: msg.dot }}
          aria-hidden
        />
      )}
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
