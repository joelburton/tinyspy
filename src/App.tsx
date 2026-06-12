import { useState } from 'react'
import { useSession } from './hooks/useSession'
import { LoginScreen } from './components/LoginScreen'
import { HomeScreen } from './components/HomeScreen'
import { LobbyScreen } from './components/LobbyScreen'

export default function App() {
  const { session, loading } = useSession()
  const [gameId, setGameId] = useState<string | null>(null)

  if (loading) return <div className="card">Loading…</div>
  if (!session) return <LoginScreen />
  if (gameId) return <LobbyScreen session={session} gameId={gameId} onLeave={() => setGameId(null)} />
  return <HomeScreen session={session} onEnterGame={setGameId} />
}
