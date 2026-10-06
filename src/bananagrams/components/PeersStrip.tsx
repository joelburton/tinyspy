// cs-unmet

import { Dot } from '@/common/members/Dot'
import type { GPlayer } from '../types'
import styles from './PeersStrip.module.css'

type Props = {
  players: GPlayer[]
  myId: string
}

/**
 * The race signal: each rival's unplaced tile count, ticking toward zero. This
 * is the only thing a player sees of a rival mid-race — never the board itself.
 *
 * Renders nothing in a solo game (no rivals). Racers are sorted by tiles left
 * ascending (closest to finishing at the top); conceded rivals sink to the
 * bottom, shown as "out".
 */
export function PeersStrip({ players, myId }: Props) {
  // A rival who conceded reads "out" and the winner "done!"; everyone else
  // shows their tiles left.
  function getScoreOrOut(player: GPlayer) {
    return player.conceded ? 'out' : player.solved ? 'done!' : player.nUnplacedTiles
  }


  // Conceded players are out of the race → sort them last regardless of count;
  // among the racers, closest to done first.
  const rank = (p: GPlayer) => (p.conceded ? 1e9 : 0) + p.nUnplacedTiles
  const rivals = players
    .filter((p) => p.id !== myId)
    .sort((a, b) => rank(a) - rank(b))

  if (rivals.length === 0) return null

  return (
    <div className={styles.peers}>
      <div className={styles.heading}>Tiles left</div>
      {rivals.map((p) => (
        <div key={p.id} className={styles.peer} data-peer={p.id}>
          <Dot color={p.color} className={styles.dot} />
          <span className={styles.name}>{p.username}</span>
          <span className={styles.count} data-count>
            {getScoreOrOut(p)}
          </span>
        </div>
      ))}
    </div>
  )
}
