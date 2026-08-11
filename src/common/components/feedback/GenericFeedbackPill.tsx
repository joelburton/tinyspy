import { cls } from '../../lib/util/cls'
import type { GenericFeedbackMsg } from '../../lib/games'
import { Dot } from '../text/Dot'
import styles from './GenericFeedbackPill.module.css'

type Props = {
  msg: GenericFeedbackMsg
  onClose: () => void
}

/**
 * The shared feedback pill — the "what just happened" display. It serves BOTH
 * feedback areas (docs/ui.md → Feedback pill): the GLOBAL one (the header
 * `<StatusSlot>`, via `ctx.globalFeedback.show()`, left-justified, for peer/opponent
 * messages) and the LOCAL one (a below-board slot a game renders directly,
 * centered, for the player's own move). See docs/ui.md → "Feedback pill" for the
 * full API contract.
 *
 * Four modes (`msg.mode` — see GenericFeedbackMsg for the full contract):
 *   - `sticky`:    stays until something replaces it or the player acts — a
 *                  keystroke, a tile click, or a tap on the pill.
 *   - `timed`:     self-clears via the host's auto-clear effect; a tap kills it
 *                  early.
 *   - `manual`:    the × is the ONLY way out. A tap on the body deliberately
 *                  does nothing — its whole point is see-and-acknowledge, and a
 *                  body that swallowed the gesture would make the × decorative.
 *   - `permanent`: a standing condition (the terminal verdict, "Conceded — race
 *                  continues"). Nothing dismisses it; a later pill REPLACES it.
 *                  The tinted background is what says so.
 *
 * Tapping a `sticky` or `timed` pill dismisses it, because the app's rule was
 * always "your next action clears the feedback" and a tap is an action. On touch
 * that rule had one fewer way to fire — no keystroke — so the message was the
 * most conspicuous thing on screen and the only one that ignored you.
 *
 * A plain click handler, not a `role="button"`: a board can show a hundred of
 * these over a game and none of them should become tab stops. `cursor: pointer`
 * is what tells a mouse user the same thing the tap teaches by working.
 *
 * Visual tone (`success` / `error` / `warning` / `neutral` / `info`) picks a
 * background + border color via a CSS-class branch. Tones are global UI-state
 * vocabulary (docs/ui.md → "Two vocabularies") — a connections "wrong guess"
 * pill looks like a codenamesduet "clue invalid" pill looks like a future Boggle
 * "not a word" pill.
 *
 * `msg.variant` is the transient-vs-permanent axis (docs/ui.md →
 * Feedback pill):
 *   - `'outline'` → TRANSIENT: white background, tone-colored border.
 *   - omitted / `'fill'` → PERMANENT: a lightened-tone background + border, so it
 *     reads *more* like its tone (a terminal message, an end-game mode).
 * `msg.dot` is independent of that axis: a leading player-color disc naming the
 * actor in a peer message (docs/ui.md → "Player identity = a colored disc").
 */
export function GenericFeedbackPill({ msg, onClose }: Props) {
  const { kind } = msg.mode
  // Appearance follows the mode: only a PERMANENT condition wears the tinted
  // background. Everything else is a message, and messages are outlined.
  const outline = kind !== 'permanent'
  // A direct reading of the modes: sticky and timed are messages you're done
  // with, `manual` insists on its ×, `permanent` isn't dismissable at all.
  const tapToDismiss = kind === 'sticky' || kind === 'timed'
  return (
    <div
      className={cls(
        styles.pill,
        styles[msg.tone],
        outline && styles.outline,
        tapToDismiss && styles.tappable,
      )}
      onClick={tapToDismiss ? onClose : undefined}
    >
      {/* `dot` is the actor's color NAME; null still shows the neutral disc
          (see GenericFeedbackMsg.dot) — only an ABSENT dot renders nothing. */}
      {msg.dot !== undefined && <Dot color={msg.dot} className={styles.dot} />}
      <span className={styles.text}>{msg.text}</span>
      {kind === 'manual' && (
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
