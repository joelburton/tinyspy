import { useEffect, useState } from 'react'
import type { GameRootProps } from '../common/lib/games'
import { readHashCode, writeHashCode } from '../common/lib/url'
import { db } from './db'
import { useGame } from './hooks/useGame'
import { HomeScreen } from './components/HomeScreen'
import { LobbyScreen } from './components/LobbyScreen'
import { BoardScreen } from './components/BoardScreen'

/**
 * Top-level Tinyspy mount point — everything from "signed in" onward.
 *
 * State machine inside one game schema:
 *
 *     restoring → HomeScreen   (no active game)
 *               ↘
 *                LobbyScreen   (game.status = 'lobby')
 *                BoardScreen   (any other status)
 *
 * The current gameId is tracked in component state AND mirrored to
 * the URL hash (`#game=<join_code>`) so refresh and link-sharing work.
 * The hash is the source of truth on a cold load — see the restore
 * effect below.
 *
 * The shell (src/App.tsx) hands us a session and stays game-agnostic;
 * everything Tinyspy-specific (home flow, lobby, board, the join_game
 * URL-restore RPC) lives here or in components mounted from here.
 */
export function TinyspyRoot({ session }: GameRootProps) {
  const [gameId, setGameId] = useState<string | null>(null)
  // `restoring` covers the brief window between Root mounting and the
  // URL hash resolving. Without it, a user with `#game=ABC` would
  // flash the home screen before being kicked into the game.
  const [restoring, setRestoring] = useState(true)

  function enterGame(id: string, code: string) {
    setGameId(id)
    writeHashCode(code)
  }

  function leaveGame() {
    setGameId(null)
    writeHashCode(null)
  }

  // Restore the game referenced by the URL hash once on mount.
  //
  // join_game is idempotent for an existing player (returns the game
  // id back), so calling it on refresh is safe. For a fresh user
  // receiving the URL as an invite link, it does the actual join —
  // same code path.
  //
  // Bad code → clear the hash silently and drop the user on the home
  // screen.
  useEffect(() => {
    if (gameId) {
      setRestoring(false)
      return
    }
    const code = readHashCode()
    if (!code) {
      setRestoring(false)
      return
    }
    db.rpc('join_game', { code }).then(({ data, error }) => {
      if (error || !data) {
        console.warn('could not restore game from URL', error)
        writeHashCode(null)
      } else {
        setGameId(data)
      }
      setRestoring(false)
    })
  }, [session.user.id, gameId])

  if (restoring) return <div className="card">Loading…</div>
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
 * Inner state machine for an active gameId: shows either LobbyScreen
 * (status = 'lobby') or BoardScreen (any other status). The transition
 * is driven entirely by `games.status` changes propagated through
 * Realtime — when start_game flips status to 'active', both players'
 * screens swap from lobby to board automatically with no extra
 * navigation logic.
 */
function InGame({
  session,
  gameId,
  onLeave,
  onEnterGame,
}: {
  session: GameRootProps['session']
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
