import type { Member } from '../lib/games'
import { colorVarFor } from '../lib/memberColor'
import styles from './PlayersStrip.module.css'

type Props = {
  players: Member[]
}

/**
 * The default content of `<StatusSlot>` in the GamePage header:
 * a row of player usernames, each rendered in that player's
 * profile color.
 *
 * Why colored usernames as the default: a player who sees a
 * colored cue elsewhere in the game (e.g. an orange frame on a
 * wordknit tile, an orange dot in psychic-num's guess history)
 * can read "orange is moth" off the strip without hovering or
 * digging through the roster panel.
 *
 * Replaced by `<FeedbackPill>` when `ctx.feedback.show()` has
 * been called; the underlying roster keeps updating in the
 * background, so when the pill clears the strip reflects whoever
 * is in the game right now.
 *
 * Per docs/ui.md → Layout stability, the slot height stays the
 * same whether the strip or the pill is showing — so the rest of
 * the header doesn't reflow as feedback comes and goes.
 *
 * Real-estate caveat: we're inline-with-middle-dot today,
 * ellipsis-on-overflow. As the player count grows (or screen
 * width shrinks during a future mobile pass), the strip will
 * need a different shape (colored dots? initials? a scrolling
 * sub-element?). Deferred until those constraints actually bite.
 */
export function PlayersStrip({ players }: Props) {
  return (
    <div className={styles.strip}>
      {players.map((p, i) => {
        const color = colorVarFor(p.color)
        return (
          <span key={p.user_id} className={styles.entry}>
            <span
              className={styles.dot}
              style={{ background: color }}
              aria-hidden
            />
            <span className={styles.username} style={{ color }}>
              {p.username}
            </span>
            {i < players.length - 1 && (
              <span className={styles.sep} aria-hidden>
                {' · '}
              </span>
            )}
          </span>
        )
      })}
    </div>
  )
}
