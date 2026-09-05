// cs-unmet

import type { Member } from '../members/member'
import { Dot } from '../members/Dot'
import styles from './RichMessage.module.css'

/**
 * A "rich" message — a sequence of text + inline player segments — so an error
 * (or any message) can name players with their identity disc inline:
 * "…needs these players: ● bert, ● ernie, ● claude." A plain `string` is still a
 * valid message everywhere a `RichMessage` is accepted; this is just the
 * structured form, rendered by the component below. Self-contained (each segment
 * carries the full `Member`), so it needs no resolver wherever it's shown.
 *
 * **Named `RichMessageType` because the component below owns the plain name.**
 * It lived in `lib/games.ts` until the split, where this file was its only
 * importer — and imported it back out under exactly this alias, which is the
 * tell that the type belongs beside its component (docs/common-folders.md →
 * Judgment calls; plans/areas/game-lib.md → `F-game-lib-1`).
 */
export type RichMessageType = Array<string | { player: Member }>

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
