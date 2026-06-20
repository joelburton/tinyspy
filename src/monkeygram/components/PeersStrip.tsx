import type { Member } from '../../common/lib/games'
import { colorVarFor } from '../../common/lib/memberColor'
import type { MonkeyGramProgress } from '../hooks/useGame'
import styles from './PeersStrip.module.css'

type Props = {
  players: Member[]
  progress: MonkeyGramProgress[]
  selfUserId: string
}

/**
 * The race signal: each opponent's remaining (unplaced) tile count, ticking
 * toward zero. This is the *only* thing a player sees about a peer — never the
 * board itself. Counts come from `monkeygram.progress` (club-readable),
 * updated live as each peer snapshots their board.
 *
 * Renders nothing in a solo game (no peers). Peers are sorted by tiles-left
 * ascending, so whoever's closest to finishing sits at the top.
 */
export function PeersStrip({ players, progress, selfUserId }: Props) {
  const byUser = new Map(progress.map((p) => [p.user_id, p]))
  const peers = players
    .filter((p) => p.user_id !== selfUserId)
    .sort((a, b) => (byUser.get(a.user_id)?.unplaced ?? Infinity) - (byUser.get(b.user_id)?.unplaced ?? Infinity))

  if (peers.length === 0) return null

  return (
    <div className={styles.peers}>
      <div className={styles.heading}>Tiles left</div>
      {peers.map((p) => {
        const pr = byUser.get(p.user_id)
        return (
          <div key={p.user_id} className={styles.peer} data-peer={p.user_id}>
            <span className={styles.dot} style={{ background: colorVarFor(p.color) }} aria-hidden />
            <span className={styles.name}>{p.username}</span>
            <span className={styles.count} data-count>
              {pr?.done ? 'done!' : (pr?.unplaced ?? '—')}
            </span>
          </div>
        )
      })}
    </div>
  )
}
