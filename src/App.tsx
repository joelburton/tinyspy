import { useState } from 'react'
import { useSession } from './hooks/useSession'
import { useGame } from './hooks/useGame'
import { LoginScreen } from './components/LoginScreen'
import { HomeScreen } from './components/HomeScreen'
import { LobbyScreen } from './components/LobbyScreen'
import { BoardScreen } from './components/BoardScreen'
import type { Session } from '@supabase/supabase-js'

export default function App() {
  const { session, loading } = useSession()
  const [gameId, setGameId] = useState<string | null>(null)

  if (loading) return <div className="card">Loading…</div>
  if (!session) return <LoginScreen />
  if (!gameId) return <HomeScreen session={session} onEnterGame={setGameId} />
  return <InGame session={session} gameId={gameId} onLeave={() => setGameId(null)} />
}

// Switches between lobby and board based on game status. Reads the game's
// status via the useGame hook (also keeps the board's header live-updated).
function InGame({
  session,
  gameId,
  onLeave,
}: {
  session: Session
  gameId: string
  onLeave: () => void
}) {
  const { game, loading } = useGame(gameId)

  if (loading) return <div className="card">Loading game…</div>
  if (!game) return <div className="card">Game not found.</div>
  if (game.status === 'lobby') {
    return <LobbyScreen session={session} gameId={gameId} onLeave={onLeave} />
  }
  return <BoardScreen session={session} gameId={gameId} />
}
