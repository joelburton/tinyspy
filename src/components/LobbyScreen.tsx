import { useGame } from '../hooks/useGame'
import type { Session } from '@supabase/supabase-js'

type Props = {
  session: Session
  gameId: string
  onLeave: () => void
}

export function LobbyScreen({ session, gameId, onLeave }: Props) {
  const { game, players, loading } = useGame(gameId)

  if (loading || !game) return <div className="card">Loading game…</div>

  const playerA = players.find((p) => p.seat === 'A')
  const playerB = players.find((p) => p.seat === 'B')
  const youAre = players.find((p) => p.user_id === session.user.id)
  const both = playerA && playerB

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
          <button type="button" disabled>
            Start game (coming in step 3)
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
    </div>
  )
}
