// cs-audited-page-header

import type { Member } from '../members/member'
import { Dot } from '../members/Dot'
import styles from './PageHeaderPlayersStrip.module.css'

type Props = {
  players: Member[]
  // When provided, members NOT in this set render their dot as an empty black
  // outline rather than a filled color circle — the club page's live presence.
  // Omit, as the in-game header does, to render every dot filled.
  presentUserIds?: Set<string>
}

/**
 * The default content of `<PageHeaderStatusSlot>` in the GamePage header (and
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
 * Replaced by `<FeedbackPill>` while the global slot holds a message; the
 * underlying roster keeps updating in the background, so when the slot
 * empties the strip reflects whoever is in the game right now. Below
 * `--mobile` the names drop and the dots carry the whole signal (the module
 * says why).
 */
export function PageHeaderPlayersStrip({ players, presentUserIds }: Props) {
  return (
    <div className={styles.strip}>
      {players.map((p) => {
        // No presence set → treat everyone as present (filled dot).
        const present = presentUserIds ? presentUserIds.has(p.user_id) : true
        return (
          <span
            key={p.user_id}
            className={styles.entry}
            // The styled hover bubble (TooltipHost), the same mechanism every
            // other hover text in the header uses — never the native `title`.
            data-tooltip={
              presentUserIds
                ? present
                  ? 'In the club'
                  : 'Away'
                : undefined
            }
          >
            {/* Present: the shared disc, filled + ringed in the player color.
                Away: the disc's hollow variant (the color drops out so absence
                reads at a glance). Same dimensions either way. */}
            <Dot color={p.color} hollow={!present} className={styles.dot} />
            <span className={styles.username}>{p.username}</span>
          </span>
        )
      })}
    </div>
  )
}
