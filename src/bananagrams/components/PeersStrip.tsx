import type { Member } from '../../common/lib/games'
import { colorVarFor } from '../../common/lib/memberColor'
import type { BananagramsProgress } from '../hooks/useGame'
import styles from './PeersStrip.module.css'

type Props = {
  players: Member[]
  progress: BananagramsProgress[]
  selfUserId: string
}

/**
 * The race signal: each opponent's remaining (unplaced) tile count, ticking
 * toward zero. This is the *only* thing a player sees about a peer — never the
 * board itself. Counts come from `bananagrams.progress` (club-readable),
 * updated live as each peer snapshots their board.
 *
 * Renders nothing in a solo game (no peers). Active peers are sorted by
 * tiles-left ascending (closest to finishing at the top); conceded peers (who
 * have dropped out of the race) sink to the bottom, shown as "out".
 */
export function PeersStrip({ players, progress, selfUserId }: Props) {
  const byUser = new Map(progress.map((p) => [p.user_id, p]))
  // Conceded players are out of the race → sort them last regardless of count;
  // among active players, closest-to-done first.
  const rank = (userId: string) =>
    (byUser.get(userId)?.conceded ? 1e9 : 0) + (byUser.get(userId)?.unplaced ?? Infinity)
  const peers = players
    .filter((p) => p.user_id !== selfUserId)
    .sort((a, b) => rank(a.user_id) - rank(b.user_id))

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
              {pr?.conceded ? 'out' : pr?.done ? 'done!' : (pr?.unplaced ?? '—')}
            </span>
          </div>
        )
      })}
    </div>
  )
}
