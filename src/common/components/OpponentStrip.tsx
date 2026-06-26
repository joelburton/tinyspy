import type { ReactNode } from 'react'
import type { Member } from '../lib/games'
import { colorVarFor } from '../lib/memberColor'
import { orderSelfFirst } from '../lib/peers'
import styles from './OpponentStrip.module.css'

type Props = {
  players: Member[]
  selfId: string
  /**
   * The per-player metric cell — the one thing each game supplies. The
   * `isSelf` flag lets a game read its own value from a live local
   * computation (so "You" updates in lock step with the rest of the UI)
   * while peers read from the realtime payload. Returns whatever the
   * game wants to show: a number, a rank name, `<MistakeDots>`, etc.
   */
  metricFor: (player: Member, isSelf: boolean) => ReactNode
  /** Optional row rendered above the entries, e.g. spellingbee's
   *  "target: Amazing". Omit when there's nothing to lead with. */
  leading?: ReactNode
}

/**
 * The in-game per-player progress strip: "You: 3 · Bea: 5 · Cade: 2".
 * The standard "how is everyone doing" surface for multiplayer games —
 * each player's name in their profile color, the viewer first (via
 * `orderSelfFirst`), followed by a game-specific metric cell.
 *
 * Four games render exactly this shape and differ ONLY in the metric:
 * waffle (swaps + ✓/✗), connections (mistake dots), spellingbee (rank),
 * psychicnum (guess budget). They pass a `metricFor` and share
 * everything else — order, the colored-name label, the `·` separators,
 * the wrapper, the CSS.
 *
 * Not used by monkeygram: its peer display is a vertical dot-list
 * sorted by who's closest to finishing — a different shape that belongs
 * to the `PlayersStrip` dot family, not this inline strip.
 */
export function OpponentStrip({ players, selfId, metricFor, leading }: Props) {
  const ordered = orderSelfFirst(players, selfId)
  return (
    <div className={styles.strip}>
      {leading && <div className={styles.leading}>{leading}</div>}
      <div className={styles.entries}>
        {ordered.map((p, i) => {
          const isSelf = p.user_id === selfId
          return (
            <span key={p.user_id} className={styles.entry}>
              {i > 0 && <span className={styles.sep}>·</span>}
              <strong style={{ color: colorVarFor(p.color) }}>
                {isSelf ? 'You' : p.username}
              </strong>
              : {metricFor(p, isSelf)}
            </span>
          )
        })}
      </div>
    </div>
  )
}
