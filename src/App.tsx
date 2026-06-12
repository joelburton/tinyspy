import { useEffect, useState } from 'react'
import type { Session } from '@supabase/supabase-js'
import { supabase } from './lib/supabase'
import { useSession } from './hooks/useSession'
import { useGame } from './hooks/useGame'
import { LoginScreen } from './components/LoginScreen'
import { HomeScreen } from './components/HomeScreen'
import { LobbyScreen } from './components/LobbyScreen'
import { BoardScreen } from './components/BoardScreen'

// The URL hash holds the join code (not the UUID) so links are shareable
// and refresh-safe. On load, join_game(code) is idempotent for an existing
// player and resolves the code back to a UUID.
function readHashCode(): string | null {
  const m = window.location.hash.match(/^#game=([A-Za-z0-9]+)$/)
  return m ? m[1].toUpperCase() : null
}

function writeHashCode(code: string | null) {
  const next = code ? `#game=${code}` : window.location.pathname + window.location.search
  window.history.replaceState(null, '', next)
}

export default function App() {
  const { session, loading } = useSession()
  const [gameId, setGameId] = useState<string | null>(null)
  const [restoring, setRestoring] = useState(true)

  function enterGame(id: string, code: string) {
    setGameId(id)
    writeHashCode(code)
  }

  function leaveGame() {
    setGameId(null)
    writeHashCode(null)
  }

  // On session load, restore the game referenced by the URL hash (if any).
  // join_game is idempotent for an existing player; for a stranger it does
  // the actual join (treating the URL as a shared invite link).
  useEffect(() => {
    if (loading) return
    if (!session) {
      setRestoring(false)
      return
    }
    if (gameId) {
      setRestoring(false)
      return
    }
    const code = readHashCode()
    if (!code) {
      setRestoring(false)
      return
    }
    supabase.rpc('join_game', { code }).then(({ data, error }) => {
      if (error || !data) {
        console.warn('could not restore game from URL', error)
        writeHashCode(null)
      } else {
        setGameId(data)
      }
      setRestoring(false)
    })
  }, [loading, session?.user.id, gameId])

  if (loading || restoring) return <div className="card">Loading…</div>
  if (!session) return <LoginScreen />
  if (!gameId) return <HomeScreen session={session} onEnterGame={enterGame} />
  return (
    <InGame
      session={session}
      gameId={gameId}
      onLeave={leaveGame}
      onEnterGame={enterGame}
    />
  )
}

// Switches between lobby and board based on game status. Reads the game's
// status via the useGame hook (also keeps the board's header live-updated).
function InGame({
  session,
  gameId,
  onLeave,
  onEnterGame,
}: {
  session: Session
  gameId: string
  onLeave: () => void
  onEnterGame: (id: string, joinCode: string) => void
}) {
  const { game, loading } = useGame(gameId)

  if (loading) return <div className="card">Loading game…</div>
  if (!game) return <div className="card">Game not found.</div>
  if (game.status === 'lobby') {
    return <LobbyScreen session={session} gameId={gameId} onLeave={onLeave} />
  }
  return (
    <BoardScreen
      session={session}
      gameId={gameId}
      onLeave={onLeave}
      onEnterGame={onEnterGame}
    />
  )
}
