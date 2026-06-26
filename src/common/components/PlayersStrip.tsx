import type { Member } from '../lib/games'
import { colorVarFor } from '../lib/memberColor'
import styles from './PlayersStrip.module.css'

type Props = {
  players: Member[]
  /** When provided, members NOT in this set render their dot as an
   *  empty black outline rather than a filled color circle. Drives
   *  the club-page member strip's live presence (who's in the club
   *  orbit right now). Omit — as the in-game header does — to render
   *  every dot filled. */
  presentUserIds?: Set<string>
}

/**
 * The default content of `<StatusSlot>` in the GamePage header (and
 * the club-page header): a row of player usernames in black, each
 * prefixed by a dot in that player's profile color.
 *
 * The color lives on the **dot**, not the name: a player who sees a
 * colored cue elsewhere in the game (an orange frame on a connections
 * tile, an orange marker in psychicnum's history) can read "orange
 * is moth" off the dot, while the names stay legible in plain black.
 *
 * When a `presentUserIds` set is supplied (club page), an absent
 * member's dot becomes an empty black outline — present = filled
 * color, away = hollow. The name stays black either way.
 *
 * Replaced by `<FeedbackPill>` when `ctx.feedback.show()` has been
 * called; the underlying roster keeps updating in the background, so
 * when the pill clears the strip reflects whoever is in the game
 * right now. Per docs/ui.md → Layout stability, the slot height
 * stays constant whether the strip or the pill is showing.
 *
 * Real-estate caveat: inline-with-middle-dot today,
 * ellipsis-on-overflow. As the player count grows (or screen width
 * shrinks during a future mobile pass), the strip will need a
 * different shape. Deferred until those constraints actually bite.
 */
export function PlayersStrip({ players, presentUserIds }: Props) {
  return (
    <div className={styles.strip}>
      {players.map((p) => {
        const color = colorVarFor(p.color)
        // No presence set → treat everyone as present (filled dot).
        const present = presentUserIds ? presentUserIds.has(p.user_id) : true
        // Present: filled with the player color. Away: hollow with a
        // black outline (the color drops out so absence reads at a
        // glance). Same box-sized dimensions either way.
        const dotStyle = present
          ? { background: color, borderColor: color }
          : { background: 'transparent', borderColor: 'var(--color-text)' }
        return (
          <span
            key={p.user_id}
            className={styles.entry}
            title={
              presentUserIds
                ? present
                  ? 'In the club'
                  : 'Away'
                : undefined
            }
          >
            <span className={styles.dot} style={dotStyle} aria-hidden />
            <span className={styles.username}>{p.username}</span>
          </span>
        )
      })}
    </div>
  )
}
