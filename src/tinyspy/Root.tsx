import type { GameRootProps } from '../common/lib/games'
import { navigate } from '../common/lib/router'
import { useGame } from './hooks/useGame'
import { BoardScreen } from './components/BoardScreen'
import './theme.css'  // tinyspy-specific color tokens (lazy-loaded with this chunk)

/**
 * Tinyspy mount point. The shell parses `/g/tinyspy/<gameId>`,
 * looks up this manifest's Root, and mounts it with `gameId` as
 * a prop. The Root no longer parses the URL itself — that's
 * App.tsx's job — and it can trust `gameId` is non-empty.
 *
 * Under the clubs model both members are seated at game-creation
 * time and the game starts directly in 'active' — so there's no
 * lobby branch to handle, and the Root collapses to: load the
 * game, render a loading/not-found gate, mount BoardScreen.
 *
 * `play_again`'s "enter the new game" hop hard-codes the tinyspy
 * gametype, since this Root only ever exists for tinyspy games.
 * The gametype-in-URL machinery sits in common code; the
 * per-game Root just knows its own name.
 */
export function TinyspyRoot({ session, gameId }: GameRootProps) {
  const { game, loading } = useGame(gameId)

  function enterGame(id: string) {
    navigate(`/g/tinyspy/${id}`)
  }

  function leaveGame() {
    // Drop the user back at the home page. Could navigate to the
    // game's club page instead (`/c/<handle>`) but we'd need an
    // extra fetch to resolve the handle; home is fine for v1.
    navigate('/')
  }

  if (loading) return <div className="card">Loading game…</div>
  if (!game) return <div className="card">Game not found.</div>

  return (
    <BoardScreen
      session={session}
      gameId={gameId}
      onLeave={leaveGame}
      onEnterGame={enterGame}
    />
  )
}
