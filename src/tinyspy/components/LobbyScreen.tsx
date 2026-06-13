import { useState } from 'react'
import type { Session } from '@supabase/supabase-js'
import { db } from '../db'
import { useGame } from '../hooks/useGame'

type Props = {
  session: Session
  gameId: string
  onLeave: () => void
}

/**
 * Pre-game waiting room.
 *
 * Shows the join code prominently (so the creator can share it with a
 * partner) and the two seat slots. Once both seats fill, the seat-A
 * player gets a Start-game button that calls the `start_game` RPC.
 *
 * No explicit navigation away from this screen — when start_game flips
 * games.status to 'active', useGame's Realtime subscription notices and
 * App's InGame swaps over to BoardScreen automatically.
 */
export function LobbyScreen({ session, gameId, onLeave }: Props) {
  const { game, players, loading } = useGame(gameId)
  const [starting, setStarting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  if (loading || !game) return <div className="card">Loading game…</div>

  const playerA = players.find((p) => p.seat === 'A')
  const playerB = players.find((p) => p.seat === 'B')
  const youAre = players.find((p) => p.user_id === session.user.id)
  const both = playerA && playerB

  async function onStart() {
    setError(null)
    setStarting(true)
    const { error } = await db.rpc('start_game', { target_game: gameId })
    if (error) {
      setError(error.message)
      setStarting(false)
    }
    // Successful start flips games.status; useGame's realtime subscription
    // picks it up and App switches to BoardScreen — no manual nav.
  }

  return (
    <div className="card">
      <h1>Game lobby</h1>

      <div className="join-code-display">
        <div className="muted">Share this code:</div>
        <div className="join-code">{game.join_code}</div>
      </div>

      <div className="seat-list">
        <div className="seat">
          <span className="seat-label">A</span>
          <span>{playerA?.display_name ?? <em className="muted">waiting…</em>}</span>
          {playerA?.user_id === session.user.id && <span className="muted">(you)</span>}
        </div>
        <div className="seat">
          <span className="seat-label">B</span>
          <span>{playerB?.display_name ?? <em className="muted">waiting…</em>}</span>
          {playerB?.user_id === session.user.id && <span className="muted">(you)</span>}
        </div>
      </div>

      <div className="actions">
        {both && youAre?.seat === 'A' && (
          <button type="button" onClick={onStart} disabled={starting}>
            {starting ? 'Starting…' : 'Start game'}
          </button>
        )}
        {both && youAre?.seat !== 'A' && (
          <p className="muted">Waiting for player A to start the game…</p>
        )}
        {!both && <p className="muted">Waiting for opponent to join…</p>}
        <button type="button" onClick={onLeave} className="secondary">
          Leave
        </button>
      </div>

      {error && <p className="error">{error}</p>}
    </div>
  )
}
