import { useMemo } from 'react'
import type { GameRootProps } from '../common/lib/games'
import { navigate, usePath } from '../common/lib/router'
import { useGame } from './hooks/useGame'
import { BoardScreen } from './components/BoardScreen'
import './theme.css'  // tinyspy-specific color tokens (lazy-loaded with this chunk)

/**
 * Tinyspy mount point. The shell routes `/g/<gameId>` here; this
 * component figures out which game id is being asked for and renders
 * BoardScreen for it. Everything else (the home page, the club
 * page, the create-club form) lives at the shell level now.
 *
 * No lobby state anymore — under the clubs model, both members are
 * seated at game-creation time and the game starts directly in
 * 'active'. So there's no LobbyScreen and no status='lobby' branch
 * to handle; useGame's loaded game is always already playable
 * (or already-completed for terminal states).
 *
 * URL is the source of truth for gameId — derived from `usePath()`,
 * not held in `useState`. enterGame / leaveGame are thin shims
 * that just navigate; the next render picks up the new path.
 */
export function TinyspyRoot({ session }: GameRootProps) {
  const path = usePath()

  // Match `/g/<gameId>` and extract the UUID. Anything else means
  // we shouldn't have been mounted in the first place — App.tsx
  // only routes to us for paths starting `/g/`.
  const gameId = useMemo(() => {
    const m = path.match(/^\/g\/([0-9a-f-]+)\/?$/i)
    return m ? m[1] : null
  }, [path])

  function enterGame(id: string) {
    navigate(`/g/${id}`)
  }

  function leaveGame() {
    // Drop the user back at the home page. Could navigate to the
    // game's club page instead (`/c/<handle>`) but we'd need an
    // extra fetch to resolve the handle; home is fine for v1.
    navigate('/')
  }

  if (!gameId) {
    return <div className="card">Game not found.</div>
  }

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
 * Internal helper that loads the game and renders BoardScreen.
 * Used to also branch to LobbyScreen on status='lobby'; that state
 * doesn't exist under the clubs model so the only thing this does
 * now is handle the loading and not-found states cleanly.
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
  onEnterGame: (id: string) => void
}) {
  const { game, loading } = useGame(gameId)

  if (loading) return <div className="card">Loading game…</div>
  if (!game) return <div className="card">Game not found.</div>

  return (
    <BoardScreen
      session={session}
      gameId={gameId}
      onLeave={onLeave}
      onEnterGame={onEnterGame}
    />
  )
}
