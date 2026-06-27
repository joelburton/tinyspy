import { colorVarFor } from '../../common/lib/memberColor'
import type { Player } from '../hooks/useGame'
import styles from './OpponentStrip.module.css'

export type LeaderRow = { user_id: string; count: number; score: number }

/**
 * Compete-mode awareness strip: each player's word count + score (from
 * `common.games.status.leaderboard`, maintained by `boggle._refresh_status`).
 * Shows how everyone's *doing* without revealing the words they found — the
 * compete privacy line. Sorted by score, you highlighted.
 */
export function OpponentStrip({
  leaderboard,
  players,
  myId,
}: {
  leaderboard: LeaderRow[]
  players: Player[]
  myId: string
}) {
  if (leaderboard.length === 0) return null
  const nameOf = (id: string) => players.find((p) => p.user_id === id)?.username ?? '?'
  const colorOf = (id: string) => {
    const color = players.find((p) => p.user_id === id)?.color
    return color ? colorVarFor(color) : 'var(--color-text)'
  }
  const sorted = [...leaderboard].sort((a, b) => b.score - a.score)

  return (
    <div className={styles.strip}>
      {sorted.map((r) => (
        <span key={r.user_id} className={styles.player} style={{ color: colorOf(r.user_id) }}>
          {nameOf(r.user_id)}
          {r.user_id === myId ? ' (you)' : ''}: {r.count}w · {r.score}p
        </span>
      ))}
    </div>
  )
}
