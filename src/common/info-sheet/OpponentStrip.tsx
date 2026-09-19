// cs-blessed-info-sheet

import type { ReactNode } from 'react'
import type { Member } from '../members/member'
import { orderSelfFirst } from '../members/memberList'
import { Dot } from '../members/Dot'
import styles from './OpponentStrip.module.css'

type Props = {
  players: Member[]
  selfId: string
  // The per-player metric cell — the one thing each game supplies. The
  // `isSelf` flag lets a game read its own value from a live local
  // computation (so "You" updates in lock step with the rest of the UI)
  // while peers read from the realtime payload. Returns whatever the
  // game wants to show: a number, a rank name, `<MistakeDots>`, etc.
  metricFor: (player: Member, isSelf: boolean) => ReactNode
  // A short label naming WHAT the metric is — "Found", "Score", "Turns left" —
  // rendered as a prefix. Required, because a row of bare figures does not say
  // what it is counting.
  metricLabel: string
  // Optional row rendered above the entries, e.g. spellingbee's
  // "target: Amazing". Omit when there's nothing to lead with.
  leading?: ReactNode
}

/**
 * The in-game per-player progress strip: "Found: ● You: 3 · ● Bea: 5 · ● Cade: 2".
 * The standard "how is everyone doing" surface for multiplayer games —
 * each player marked by a leading disc in their profile color (identity rides
 * the disc, not the name — docs/ui.md → Player identity), the viewer first (via
 * `orderSelfFirst`), followed by a game-specific metric cell.
 *
 * An InfoCol places it whenever its game has a per-player metric worth showing,
 * and the metric cell is the ONLY thing those games differ in — waffle's swaps +
 * ✓/✗, connections's mistake dots, a rank, a guess budget. Everything else is
 * shared: the order, the disc + name label, the `·` separators, the wrapper, the
 * CSS.
 *
 * A game whose peer display is a different SHAPE doesn't use it — bananagrams
 * lists peers vertically, sorted by who's closest to finishing, which belongs to
 * the `PageHeaderPlayersStrip` dot family rather than this inline strip.
 */
export function OpponentStrip({ players, selfId, metricFor, metricLabel, leading }: Props) {
  const ordered = orderSelfFirst(players, selfId)
  return (
    <div className={styles.strip}>
      {leading && <div className={styles.leading}>{leading}</div>}
      <div className={styles.entries}>
        <span className={styles.metricLabel}>{metricLabel}:</span>
        {ordered.map((p, i) => {
          const isSelf = p.user_id === selfId
          return (
            <span key={p.user_id} className={styles.entry}>
              {i > 0 && <span className={styles.sep}>·</span>}
              {/* Identity rides the DOT, not the name (docs/ui.md → Player
                  identity = a colored disc): the shared disc in the player's
                  color, the same marker the header strip uses; the name
                  stays plain text so the two never fight for the color. */}
              <Dot color={p.color} className={styles.dot} />
              <strong>{isSelf ? 'You' : p.username}:</strong>
              <span className={styles.metric}>{metricFor(p, isSelf)}</span>
            </span>
          )
        })}
      </div>
    </div>
  )
}
