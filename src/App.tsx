import { useEffect, useState } from 'react'
import type { Session } from '@supabase/supabase-js'
import { supabase } from './lib/supabase'
import { readHashCode, writeHashCode } from './lib/url'
import { useSession } from './hooks/useSession'
import { useGame } from './hooks/useGame'
import { LoginScreen } from './components/LoginScreen'
import { HomeScreen } from './components/HomeScreen'
import { LobbyScreen } from './components/LobbyScreen'
import { BoardScreen } from './components/BoardScreen'

/**
 * Top-level state machine. There are four user-visible states:
 *
 *     loading  →  LoginScreen | HomeScreen | InGame (Lobby/Board)
 *
 * Routing is purely state-based (no react-router). The "current game" is
 * tracked by UUID in component state, and *also* mirrored to the URL hash
 * (as the human-friendly join code) so refresh and link-sharing both work.
 *
 * The hash is the source of truth for "what game should I be in after a
 * cold load" — see the restore effect below.
 */
export default function App() {
  const { session, loading } = useSession()
  const [gameId, setGameId] = useState<string | null>(null)
  // `restoring` covers the brief window between session-loaded and
  // hash-resolved. Without it, a user with `#game=ABC` would flash the
  // home screen before being kicked into the game.
  const [restoring, setRestoring] = useState(true)

  function enterGame(id: string, code: string) {
    setGameId(id)
    writeHashCode(code)
  }

  function leaveGame() {
    setGameId(null)
    writeHashCode(null)
  }

  // Restore the game referenced by the URL hash once the session is ready.
  //
  // join_game is idempotent for an existing player (returns the game id
  // back), so calling it on refresh is safe. For a fresh user receiving
  // the URL as an invite link, it does the actual join — same code path.
  //
  // Bad code → clear the hash silently and drop the user on the home screen.
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

/**
 * Inner state machine for an active gameId: shows either LobbyScreen (status
 * = 'lobby') or BoardScreen (any other status). The transition is driven
 * entirely by `games.status` changes propagated through Realtime — when
 * start_game flips status to 'active', both players' screens swap from
 * lobby to board automatically with no extra navigation logic.
 */
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
