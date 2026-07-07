import type { RichMessage as RichMessageType } from '../../lib/games'
import { Dot } from './Dot'
import styles from './RichMessage.module.css'

type Props = {
  /** A plain string (rendered as-is) or a `RichMessage` array (text +
   *  inline player segments). */
  message: string | RichMessageType
}

/**
 * Renders a {@link RichMessageType} — flowing text with inline **player
 * segments**, each a leading identity disc + the player's name ("● bert"), the
 * disc rule applied inline (docs/ui.md → Player identity = a colored disc). A
 * plain string renders verbatim.
 *
 * The reusable half of "rich errors": a producer (e.g. connections'
 * roster-mismatch error) builds the segment array; any consumer renders it with
 * this, no player-lookup needed (each segment carries the full `Member`).
 */
export function RichMessage({ message }: Props) {
  if (typeof message === 'string') return <>{message}</>
  return (
    <>
      {message.map((seg, i) =>
        typeof seg === 'string' ? (
          seg
        ) : (
          <span key={i} className={styles.player}>
            <Dot color={seg.player.color} className={styles.dot} />
            {seg.player.username}
          </span>
        ),
      )}
    </>
  )
}
