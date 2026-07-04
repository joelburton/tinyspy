import type { GenericFeedbackMsg, Member } from '../../lib/games'
import { GenericFeedbackPill } from '../feedback/GenericFeedbackPill'
import { PlayersStrip } from './PlayersStrip'
import styles from './StatusSlot.module.css'

type Props = {
  players: Member[]
  globalFeedback: GenericFeedbackMsg | null
  onCloseGlobalFeedback: () => void
  /** Forwarded to PlayersStrip — when set, absent members render
   *  dimmed. The club page passes its live presence set; the in-game
   *  header omits it. */
  presentUserIds?: Set<string>
}

/**
 * The middle cell of the GamePage header. Two states:
 *
 *  - **default**: `<PlayersStrip>` — colored usernames, the
 *    "who's playing and what color is who" reminder.
 *  - **feedback**: `<GenericFeedbackPill>` — the active feedback
 *    message, replacing the strip while it's showing. Three
 *    dismiss modes per docs/ui.md → "Feedback pill."
 *
 * Same height in both states. See docs/ui.md → Layout stability
 * — the slot doesn't reflow the header as feedback comes and
 * goes, because the slot's own height is fixed via CSS.
 *
 * Pause transitions don't clear feedback by default — the slot
 * sits in the header, which is outside `<PauseOverlay>`'s
 * coverage, so an active pill stays readable through a pause.
 * Callers who want feedback to drop on pause must `clear()`
 * explicitly.
 */
export function StatusSlot({
  players,
  globalFeedback,
  onCloseGlobalFeedback,
  presentUserIds,
}: Props) {
  return (
    <div className={styles.slot}>
      {globalFeedback ? (
        <GenericFeedbackPill msg={globalFeedback} onClose={onCloseGlobalFeedback} />
      ) : (
        <PlayersStrip players={players} presentUserIds={presentUserIds} />
      )}
    </div>
  )
}
